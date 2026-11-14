// Giraffe's Paint Box: paint that goes down where the open hand moves and never over the lines, pots that give their
// paint to a hand that dips in them, parts that fill themselves in, what each level brings, and that resting costs
// nothing. Everything here runs without a screen, with a pretend child moving a hand over the sheet. The tests of the
// old kind rules paint the gentle picture, with nobody to beat, as makePainting does unless a test says otherwise. The
// contest with another painter is tested at the end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanBrush, MAX_RACERS, MOST_BYTES, MOST_STROKE_NUMBERS, mostIn } from '../../server/race-room.js';
import { COLOUR_NAMES, COLOURS, boxOf, insideOutline, mixes, mixOf, outlineOf, PAGES, RAINBOW, recipeFor, SHEET } from '../../games/giraffe-paint/pages.js';
import {
  BRUSHES, CLAIM_LATE, DESK, DIP_SECONDS, DONE_SHARES, EXTRAS, FREE_SHARE, LABELS, modeWord, NEWS, newsIsOn, Painting, paintLevel,
  paintNewAt, REACH, readMode, RIVAL_PAINTERS, ROW, STROKE_NUMBERS,
} from '../../games/giraffe-paint/paint.js';

const FRAME = 1 / 60;
const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);
const OPEN = true;

function makePainting(options = {}) {
  const log = [];
  const painting = new Painting({ rival: 'gentle', onEvent: (event) => log.push(event), ...options });
  painting.log = log;
  return painting;
}

const said = (painting, type) => painting.log.filter((event) => event.type === type);
const part = (painting, id) => painting.parts.find((each) => each.id === id);
const pot = (painting, colour) => painting.pots.find((each) => each.kind === 'colour' && each.colour === colour);
const potOf = (painting, kind) => painting.pots.find((each) => each.kind === kind);
const share = (each) => each.covered / each.cells;
const paintOn = (painting, x, y) => {
  const code = painting.paint[Math.floor(y) * SHEET.width + Math.floor(x)];
  return code ? COLOUR_NAMES[code - 1] : null;
};

/** Holds the hand in one place for a while, open or closed. */
function hold(painting, seconds, at, open = OPEN) {
  for (let t = 0; t < seconds - 1e-9; t += FRAME) painting.update(FRAME, { at, open });
}

/** Moves the open hand in a straight line from one place to another, at a hand's speed. */
function sweep(painting, from, to, { speed = 40, open = OPEN } = {}) {
  const far = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(far / (speed * FRAME)));
  for (let step = 0; step <= steps; step += 1) {
    painting.update(FRAME, { at: { x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps }, open });
  }
}

/** Takes the hand out of the picture for a moment, as between one thing and the next. */
const away = (painting) => painting.update(FRAME, { at: null, open: false });

/** Dips the open hand in a pot, staying as long as it takes, and takes it away again. */
function dip(painting, which) {
  const target = typeof which === 'string' ? pot(painting, which) ?? potOf(painting, which) : which;
  assert.ok(target, `there is a ${which} pot`);
  hold(painting, DIP_SECONDS + 0.1, { x: target.x, y: target.y });
  away(painting);
}

/** Paints a part by going over every square of it that's still to do, as a child scrubbing at it would. */
function scrub(painting, id, { until = () => false } = {}) {
  const target = part(painting, id);
  for (let cell = 0; cell < painting.owner.length && !target.done && !until(); cell += 1) {
    if (painting.owner[cell] !== target.index || painting.paint[cell]) continue;
    painting.update(FRAME, { at: { x: (cell % SHEET.width) + 0.5, y: Math.floor(cell / SHEET.width) + 0.5 }, open: OPEN });
  }
  away(painting);
  return target;
}

/**
 * A pretend child: the hand goes where a child's would next (see guide), at a hand's speed and not quite steadily,
 * open all the while unless rests says when to rest. Returns how long it took.
 */
function playThrough(painting, { speed = 45, wobble = 1.5, seconds = 400, rests = () => false } = {}) {
  const hand = { x: SHEET.width / 2, y: 60 };
  let t = 0;
  for (; t < seconds && !painting.done; t += FRAME) {
    const resting = rests(t);
    const to = resting ? null : painting.guide(hand);
    if (to) {
      const far = Math.hypot(to.x - hand.x, to.y - hand.y);
      const step = Math.min(far, speed * FRAME);
      if (far > 0) {
        hand.x += ((to.x - hand.x) / far) * step;
        hand.y += ((to.y - hand.y) / far) * step;
      }
    }
    painting.update(FRAME, { at: { x: hand.x + Math.sin(t * 5.1) * wobble, y: hand.y + Math.cos(t * 3.7) * wobble }, open: !resting });
    painting.takeMarks();
  }
  return t;
}

/* ---------- the pictures ---------- */

test('shapes: a circle, an ellipse, a rectangle with round corners, straight sides and a smooth one, each with its inside and its box', () => {
  const circle = outlineOf(['c', 50, 40, 10]);
  assert.ok(insideOutline(circle, 50, 40) && insideOutline(circle, 58, 44));
  assert.ok(!insideOutline(circle, 58.5, 47.5) && !insideOutline(circle, 61, 40));
  const box = boxOf(circle);
  assert.ok(Math.abs(box.left - 40) < 0.1 && Math.abs(box.right - 60) < 0.1 && Math.abs(box.top - 30) < 0.1 && Math.abs(box.bottom - 50) < 0.1);
  // An ellipse turned a quarter of the way round is tall where it was wide.
  const turned = outlineOf(['e', 0, 0, 10, 4, 90]);
  assert.ok(insideOutline(turned, 0, 9) && !insideOutline(turned, 9, 0));
  const rounded = outlineOf(['r', 10, 20, 30, 10, 4]);
  assert.ok(insideOutline(rounded, 25, 25) && insideOutline(rounded, 11, 25));
  assert.ok(!insideOutline(rounded, 10.4, 20.4), 'the corner is rounded off');
  assert.ok(insideOutline(outlineOf(['r', 10, 20, 30, 10]), 10.4, 20.4), 'and a square one isn\'t');
  const triangle = outlineOf(['p', 0, 0, 10, 0, 5, 10]);
  assert.ok(insideOutline(triangle, 5, 3) && !insideOutline(triangle, 1, 8));
  // A smooth shape goes through each of its points.
  const smooth = outlineOf(['s', 0, 0, 10, 0, 10, 10, 0, 10]);
  for (const [x, y] of [[0, 0], [10, 0], [10, 10], [0, 10]]) {
    assert.ok(smooth.some((value, index) => index % 2 === 0 && Math.hypot(value - x, smooth[index + 1] - y) < 1e-6), `through ${x}, ${y}`);
  }
  assert.ok(insideOutline(smooth, 5, 5));
  assert.throws(() => outlineOf(['z', 1, 2]));
});

test('there are ten pictures, each with more parts to paint than the last, every part big enough to paint and to hold a dot', () => {
  assert.equal(PAGES.length, 10);
  assert.equal(new Set(PAGES.map((page) => page.id)).size, 10);
  let last = 0;
  for (const level of LEVELS) {
    const painting = makePainting({ level });
    const { page } = painting;
    assert.equal(page, PAGES[level - 1]);
    assert.equal(new Set(page.parts.map((each) => each.id)).size, page.parts.length, `${page.id}: every part has its own name`);
    assert.ok(painting.parts.length <= 30, `${page.id}: few enough parts to tell friends of in one number`);
    assert.ok(painting.toPaint.length > last, `${page.id} has more parts than the picture before: ${painting.toPaint.length} after ${last}`);
    last = painting.toPaint.length;
    for (const each of painting.toPaint) {
      assert.ok(each.cells >= 24, `${page.id}: ${each.id} shows enough to paint (${each.cells})`);
      assert.ok(each.dot && each.dot.deep >= 1.4, `${page.id}: ${each.id} has room for its dot`);
      assert.equal(painting.partAt(each.dot.x, each.dot.y), each.index, `${page.id}: ${each.id}'s dot is on it`);
      assert.ok(each.kind === 'free' || COLOUR_NAMES.includes(each.colour), `${page.id}: ${each.id} asks for a paint there is`);
    }
    for (const source of page.parts) {
      if (source.colour === RAINBOW) assert.ok(COLOURS[source.plain], `${page.id}: ${source.id} has a plain paint for games without the rainbow`);
    }
    // Whatever comes to life, hides or has to be mixed is really in the picture.
    for (const move of page.life ?? []) {
      for (const id of [...move.parts, ...(move.under ? [move.under] : [])]) assert.ok(part(painting, id), `${page.id}: ${id} comes to life`);
    }
    assert.ok((page.life ?? []).length >= 2, `${page.id} comes to life`);
    if (page.friend) assert.ok(part(painting, page.friend.part), `${page.id}: someone hides in ${page.friend.part}`);
    for (const colour of page.mix ?? []) assert.ok(recipeFor(colour) && page.parts.some((each) => each.colour === colour), `${page.id}: ${colour} can be mixed, and is asked for`);
  }
  assert.equal(last, 18);
});

test('each square of the sheet belongs to the part on top there, and white paper isn\'t a part to paint', () => {
  const giraffe = makePainting({ level: 1 });
  // The muzzle lies over the head, and the head over the ears and the neck.
  assert.equal(giraffe.partAt(63, 70), part(giraffe, 'muzzle').index);
  assert.equal(giraffe.partAt(63, 40), part(giraffe, 'head').index);
  assert.equal(giraffe.partAt(63, 95), part(giraffe, 'neck').index);
  assert.equal(giraffe.partAt(63, 60), part(giraffe, 'muzzle').index, 'where the muzzle covers the head, it\'s the muzzle');
  // Off the sheet, and on bare paper, there's nothing.
  assert.equal(giraffe.partAt(-1, 50), -1);
  assert.equal(giraffe.partAt(140, 90), -1);
  // The lighthouse's tower is white paper, with red stripes painted on it.
  const lighthouse = makePainting({ level: 4 });
  assert.equal(part(lighthouse, 'tower').kind, 'paper');
  assert.equal(lighthouse.partAt(75, 49), -1, 'the white stripe is not for painting');
  assert.equal(lighthouse.partAt(75, 60), part(lighthouse, 'door').index);
  assert.equal(lighthouse.partAt(64, 60), part(lighthouse, 'stripe-bottom').index);
  assert.ok(!lighthouse.toPaint.includes(part(lighthouse, 'tower')));
  // A part in two pieces has a dot on each.
  const horns = part(giraffe, 'horns');
  assert.equal(horns.dots.length, 2);
  assert.ok(horns.dots[0].x < 63 !== horns.dots[1].x < 63, 'one on each horn');
  assert.equal(part(giraffe, 'head').dots.length, 1);
});

test('the pots stand in a row under the sheet, one for each paint the picture asks for, big enough and all within reach', () => {
  for (const level of LEVELS) {
    for (const plain of [false, true]) {
      const painting = makePainting({ level, plain });
      const asked = new Set(painting.toPaint.filter((each) => each.kind === 'part').map((each) => each.colour));
      const mixing = painting.pots.filter((each) => each.kind === 'colour' && !each.ready).map((each) => each.colour);
      for (const colour of asked) assert.ok(pot(painting, colour), `level ${level}: a place for ${colour}`);
      for (const each of painting.pots.filter((one) => one.kind === 'colour')) {
        // Every pot is for a paint the picture asks for, or one that a paint it asks for is mixed from.
        assert.ok(asked.has(each.colour) || mixing.some((colour) => recipeFor(colour).includes(each.colour)), `level ${level}: the ${each.colour} pot is needed`);
      }
      assert.ok(painting.pots.length <= 9, `level ${level}: ${painting.pots.length} pots`);
      painting.pots.forEach((each, index) => {
        assert.ok(each.r >= 7, `level ${level}: pot ${index} is big enough (${each.r})`);
        assert.ok(each.x - each.r >= DESK.left && each.x + each.r <= DESK.right && each.y + each.r <= DESK.bottom && each.y - each.r > SHEET.height, `level ${level}: pot ${index} is on the desk, under the sheet`);
        if (index) assert.ok(each.x - painting.pots[index - 1].x >= each.r * 2 + 1, `level ${level}: pots ${index - 1} and ${index} don't touch`);
        assert.equal(painting.potAt({ x: each.x, y: each.y }), each.kind === 'colour' && !each.ready ? null : each);
      });
      // The brush starts with a paint that has a pot, for the biggest part, so it paints straight away.
      assert.ok(pot(painting, painting.brush.colour).ready);
      assert.notEqual(painting.brush.colour, RAINBOW);
    }
  }
  assert.equal(ROW.y > SHEET.height, true);
});

/* ---------- painting ---------- */

test('paint goes down where the open hand moves, inside the part that asks for it, and never over the line into another', () => {
  const painting = makePainting({ level: 1 });
  assert.equal(painting.brush.colour, 'yellow');
  const head = part(painting, 'head');
  const muzzle = part(painting, 'muzzle');
  // Across the face, from the head down into the muzzle: yellow lands on the head, and none on the muzzle.
  sweep(painting, { x: 63, y: 30 }, { x: 63, y: 75 });
  assert.ok(head.covered > 150, `the head has paint on it (${head.covered})`);
  assert.equal(muzzle.covered, 0, 'none over the line');
  assert.equal(paintOn(painting, 63, 40), 'yellow');
  assert.equal(paintOn(painting, 63, 70), null);
  // Right along the line between them, with the brush half over each: still none on the muzzle.
  sweep(painting, { x: 45, y: 58 }, { x: 80, y: 58 });
  assert.equal(muzzle.covered, 0);
  // Nothing goes on bare paper, or on any other part, and the strokes are kept for the screen, with the parts they're in.
  for (const each of painting.toPaint) if (each.colour !== 'yellow') assert.equal(each.covered, 0, each.id);
  const marks = painting.takeMarks();
  assert.ok(marks.length > 20);
  assert.ok(marks.every((mark) => mark.colour === 'yellow' && mark.r === BRUSHES.medium && mark.parts.every((index) => painting.parts[index].colour === 'yellow')));
  assert.ok(marks.some((mark) => mark.parts.includes(head.index)));
  assert.deepEqual(painting.takeMarks(), [], 'and taken once');
});

for (const [name, at] of [['closed', { x: 63, y: 40 }], ['missing', null]]) {
  test(`a ${name} hand is the brush lifted: nothing is painted, nothing is lost, and it waits for as long as it takes`, () => {
    const painting = makePainting({ level: 1 });
    sweep(painting, { x: 50, y: 40 }, { x: 76, y: 40 });
    const before = { covered: part(painting, 'head').covered, paint: painting.paint.slice(), colour: painting.brush.colour, parts: painting.stats.parts };
    assert.ok(before.covered > 0);
    // A long rest, and with the closed hand moved all over the sheet.
    hold(painting, 60, at, false);
    if (at) sweep(painting, { x: 10, y: 10 }, { x: 140, y: 90 }, { open: false });
    assert.equal(part(painting, 'head').covered, before.covered);
    assert.deepEqual(painting.paint, before.paint);
    assert.equal(painting.brush.colour, before.colour);
    assert.equal(painting.stats.parts, before.parts);
    assert.equal(painting.brush.down, false);
    assert.equal(painting.done, false);
    // And a closed hand takes no paint from a pot.
    const red = pot(painting, 'red');
    hold(painting, 2, { x: red.x, y: red.y }, false);
    assert.equal(painting.brush.colour, 'yellow');
    assert.equal(painting.stats.dips, 0);
    // Back again, it paints on from where the picture was.
    sweep(painting, { x: 50, y: 46 }, { x: 76, y: 46 });
    assert.ok(part(painting, 'head').covered > before.covered);
  });
}

test('a part fills itself in once it\'s mostly painted, and how much is enough is as a grown-up chose', () => {
  for (const [done, needs] of Object.entries(DONE_SHARES)) {
    const painting = makePainting({ level: 1, done });
    const head = part(painting, 'head');
    assert.equal(head.need, needs);
    let most = 0;
    scrub(painting, 'head', {
      until: () => {
        if (!head.done) most = Math.max(most, share(head));
        return false;
      },
    });
    assert.ok(head.done, `${done}: done`);
    // It was still to do until it had that much, and then all of it is painted.
    assert.ok(most < needs && most > needs - 0.12, `${done}: it filled in at about ${needs} (${most.toFixed(2)})`);
    assert.equal(head.covered, head.cells);
    assert.equal(paintOn(painting, head.dot.x, head.dot.y), 'yellow');
    const [event] = said(painting, 'part').filter((each) => each.part === head);
    assert.deepEqual([event.colour, event.mine], ['yellow', true]);
  }
  assert.deepEqual(Object.values(DONE_SHARES), [0.65, 0.8, 0.92]);
  // Anything that isn't one of the choices is the usual.
  assert.equal(makePainting({ done: 'lots' }).share, DONE_SHARES.most);
});

test('every part painted, the picture is done, once, and nothing more happens to it', () => {
  const painting = makePainting({ level: 1 });
  assert.equal(painting.progress, 0);
  let before = 0;
  for (const each of painting.toPaint) {
    if (painting.brush.colour !== each.colour) dip(painting, each.colour);
    scrub(painting, each.id);
    assert.ok(each.done, each.id);
    assert.ok(painting.progress > before, 'further along');
    before = painting.progress;
  }
  assert.equal(painting.done, true);
  assert.equal(painting.progress, 1);
  assert.equal(said(painting, 'done').length, 1);
  assert.equal(painting.stats.parts, 9);
  assert.equal(said(painting, 'part').length, 9);
  assert.equal(painting.guide(), null);
  // A hand still moving over it changes nothing.
  const paint = painting.paint.slice();
  dip(painting, 'red');
  sweep(painting, { x: 20, y: 20 }, { x: 130, y: 80 });
  assert.deepEqual(painting.paint, paint);
  assert.equal(said(painting, 'done').length, 1);
});

test('a quick stroke leaves no gaps, and a hand that\'s lost and found again doesn\'t draw a line between', () => {
  const painting = makePainting({ level: 4, plain: true });
  dip(painting, 'blue');
  // Right across the sea in three frames, far quicker than any hand.
  for (const x of [10, 30, 50]) painting.update(FRAME, { at: { x, y: 92 }, open: OPEN });
  for (let x = 6; x <= 54; x += 1) assert.equal(paintOn(painting, x, 92), 'blue', `painted at ${x}`);
  // The hand jumps to the other end of the sea, as when the camera loses it for a moment: no line across.
  painting.update(FRAME, { at: { x: 140, y: 92 }, open: OPEN });
  assert.equal(paintOn(painting, 140, 92), 'blue');
  for (let x = 62; x <= 128; x += 2) assert.equal(paintOn(painting, x, 92), null, `nothing at ${x}`);
  // And after a moment out of the picture, the same.
  away(painting);
  painting.update(FRAME, { at: { x: 100, y: 96 }, open: OPEN });
  assert.equal(paintOn(painting, 120, 96), null);
});

test('the brush is as big as a grown-up chose, and a bigger one paints more with the same stroke', () => {
  const covered = Object.keys(BRUSHES).map((brush) => {
    const painting = makePainting({ level: 4, brush });
    dip(painting, 'blue');
    assert.equal(painting.radius, BRUSHES[brush]);
    sweep(painting, { x: 20, y: 90 }, { x: 60, y: 90 });
    return part(painting, 'sea').covered;
  });
  assert.ok(covered[0] < covered[1] && covered[1] < covered[2], covered.join(' < '));
  assert.deepEqual(Object.values(BRUSHES), [5, 6.5, 8.5]);
  assert.equal(makePainting({ brush: 'huge' }).size, BRUSHES.medium);
  assert.deepEqual(Object.values(REACH), [1, 1.25, 1.6]);
});

/* ---------- the pots ---------- */

test('an open hand that stays in a pot a moment takes its paint, once each time it comes', () => {
  const painting = makePainting({ level: 1 });
  const red = pot(painting, 'red');
  // Not at once.
  hold(painting, DIP_SECONDS - 0.1, { x: red.x, y: red.y });
  assert.equal(painting.brush.colour, 'yellow');
  assert.ok(painting.dipping.for > 0 && !painting.dipping.done, 'the ring round the pot is closing');
  hold(painting, 0.2, { x: red.x, y: red.y });
  assert.equal(painting.brush.colour, 'red');
  assert.deepEqual(said(painting, 'dip').map((event) => event.pot), [red]);
  // Staying there is still one dip, and so is a hand that isn't steady.
  hold(painting, 3, { x: red.x + 2, y: red.y - 1 });
  assert.equal(painting.stats.dips, 1);
  // Away and back is another.
  away(painting);
  hold(painting, 0.5, { x: red.x, y: red.y });
  assert.equal(painting.stats.dips, 2);
  // Anywhere in the pot will do, and a little way outside it.
  away(painting);
  const brown = pot(painting, 'brown');
  hold(painting, 0.5, { x: brown.x + brown.r * 0.9, y: brown.y - brown.r * 0.5 });
  assert.equal(painting.brush.colour, 'brown');
  // Nothing is painted from down among the pots.
  assert.deepEqual(painting.takeMarks(), []);
});

test('a hand only passing over the pots, on its way along the row, takes nothing from them', () => {
  const painting = makePainting({ level: 2 });
  const [first, last] = [painting.pots[0], painting.pots.at(-2)];
  const before = painting.brush.colour;
  // Along the whole row at a hand's ordinary pace, and slowly.
  for (const speed of [45, 25]) {
    sweep(painting, { x: first.x - 12, y: ROW.y }, { x: last.x + 12, y: ROW.y }, { speed });
    assert.equal(painting.stats.dips, 0, `at ${speed} a second`);
    assert.equal(painting.brush.colour, before);
    away(painting);
  }
  // Stopping on one of them takes it. The hand trembles there, as a hand may.
  sweep(painting, { x: first.x - 12, y: ROW.y }, { x: last.x, y: ROW.y }, { speed: 45 });
  for (let t = 0; t < 0.6; t += FRAME) painting.update(FRAME, { at: { x: last.x + Math.sin(t * 40) * 2, y: last.y + Math.cos(t * 31) * 2 }, open: OPEN });
  assert.equal(painting.stats.dips, 1);
  assert.equal(painting.brush.colour, last.colour);
});

test('with the wrong paint nothing lands: the part shows which pot it wants, and after a good while the brush is given it', () => {
  const painting = makePainting({ level: 1 });
  const muzzle = part(painting, 'muzzle');
  const at = { x: 63, y: 72 };
  // Yellow on the orange muzzle: nothing, and for the first moment no hint either.
  hold(painting, EXTRAS.hintAfter - 0.1, at);
  assert.equal(muzzle.covered, 0);
  assert.equal(painting.hint, null);
  hold(painting, 0.3, at);
  assert.deepEqual(painting.hint, { part: muzzle.index, colour: 'orange', pots: [pot(painting, 'orange').index], recipe: null });
  // It stays up while the hand goes off to the pot, and goes once the hand has the paint.
  away(painting);
  hold(painting, 1, { x: 30, y: ROW.y - 12 }, false);
  assert.ok(painting.hint, 'still showing');
  dip(painting, 'orange');
  assert.equal(painting.hint, null);
  sweep(painting, { x: 50, y: 70 }, { x: 76, y: 70 });
  assert.ok(muzzle.covered > 100);
  assert.equal(painting.stats.helped, 0);

  // A child who doesn't go: after a good while, 6 seconds, the brush is given the paint, and it lands. (In seconds,
  // not EXTRAS.helpAfter, so a child left waiting much longer would be noticed.)
  const stuck = makePainting({ level: 1 });
  hold(stuck, 5.8, at);
  assert.equal(stuck.brush.colour, 'yellow');
  assert.equal(part(stuck, 'muzzle').covered, 0);
  hold(stuck, 0.6, at);
  assert.equal(stuck.brush.colour, 'orange');
  assert.equal(stuck.stats.helped, 1);
  assert.deepEqual(said(stuck, 'helped').map((event) => event.colour), ['orange']);
  assert.ok(part(stuck, 'muzzle').covered > 0, 'and it paints');
  assert.equal(stuck.hint, null);

  // A hint that nobody follows goes after a while, and resting never brings help: only an open hand on the part does.
  const resting = makePainting({ level: 1 });
  hold(resting, 1, at);
  assert.ok(resting.hint);
  hold(resting, EXTRAS.hintStays + 0.5, at, false);
  assert.equal(resting.hint, null);
  hold(resting, 30, at, false);
  assert.equal(resting.brush.colour, 'yellow');
  assert.equal(resting.stats.helped, 0);
  // A part that's done, bare paper, and a part of the brush's own colour never ask for anything.
  const fine = makePainting({ level: 1 });
  hold(fine, 3, { x: 140, y: 90 });
  hold(fine, 3, { x: 63, y: 40 });
  assert.equal(fine.hint, null);
});

test('free painting: any colour anywhere, and still never over the line of the part the brush is in', () => {
  const painting = makePainting({ level: 1, rule: 'free' });
  dip(painting, 'purple');
  // Purple on the muzzle, which asks for orange: it lands, and stays inside the muzzle.
  sweep(painting, { x: 52, y: 72 }, { x: 74, y: 72 });
  const muzzle = part(painting, 'muzzle');
  assert.ok(muzzle.covered > 100);
  assert.equal(paintOn(painting, 63, 72), 'purple');
  assert.equal(painting.hint, null, 'nothing asks for another paint');
  for (const each of painting.toPaint) if (each !== muzzle) assert.equal(each.covered, 0, each.id);
  // The brush right at the muzzle's top edge, half of it over the head: only the muzzle is painted.
  away(painting);
  sweep(painting, { x: 55, y: 56 }, { x: 71, y: 56 });
  assert.equal(part(painting, 'head').covered, 0);
  // A shaky hand that wanders over the line and back stays with the muzzle...
  away(painting);
  painting.update(FRAME, { at: { x: 63, y: 58 }, open: OPEN });
  for (let i = 0; i < 12; i += 1) painting.update(FRAME, { at: { x: 63 + i, y: i % 2 ? 52.5 : 56.5 }, open: OPEN });
  assert.equal(part(painting, 'head').covered, 0, 'the head next door stays clean');
  // ...and one that goes well into the head and stays there paints the head.
  sweep(painting, { x: 63, y: 56 }, { x: 63, y: 34 });
  hold(painting, 0.4, { x: 63, y: 34 });
  assert.ok(part(painting, 'head').covered > 50);
  assert.equal(paintOn(painting, 63, 34), 'purple');
  // A part painted in several colours fills in with the one it has most of, and painting over it changes its colour.
  const mixed = makePainting({ level: 1, rule: 'free' });
  dip(mixed, 'red');
  const hat = part(mixed, 'hat');
  scrub(mixed, 'hat', { until: () => share(hat) > 0.3 });
  dip(mixed, 'brown');
  scrub(mixed, 'hat');
  assert.ok(hat.done);
  assert.equal(said(mixed, 'part')[0].colour, 'brown');
  dip(mixed, 'orange');
  hold(mixed, 0.2, { x: hat.dot.x, y: hat.dot.y });
  assert.equal(paintOn(mixed, hat.dot.x, hat.dot.y), 'orange');
  assert.equal(hat.done, true);
  assert.equal(makePainting({ rule: 'anything' }).rule, 'own');
});

/* ---------- the levels ---------- */

test('every level from 2 to 10 brings one new thing, named in English and Georgian, which is on from its level and not before', () => {
  assert.deepEqual(paintNewAt(1), []);
  assert.deepEqual(Object.keys(NEWS).map(Number), [2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const keys = new Set();
  for (const [level, news] of Object.entries(NEWS)) {
    assert.equal(news.length, 1, `level ${level} brings one thing`);
    const [{ key, mark, name, nameKa }] = news;
    assert.ok(mark && name && /[ა-ჰ]/.test(nameKa), `level ${level}: a picture, and a name in each language`);
    assert.ok(newsIsOn(key, Number(level)), `${key} is on at level ${level}`);
    assert.ok(!newsIsOn(key, Number(level) - 1), `${key} is not on before level ${level}`);
    assert.deepEqual(paintNewAt(Number(level)), news);
    keys.add(key);
  }
  assert.equal(keys.size, 9, 'nine different things');
  // The tools stay for the levels after. The butterfly and the numbers are each their own picture's.
  for (const key of ['rainbow', 'stamp', 'roller', 'friend', 'dish', 'balloons']) assert.ok(newsIsOn(key, 10), `${key} stays`);
  assert.deepEqual(LEVELS.filter((level) => newsIsOn('mirror', level)), [6]);
  assert.deepEqual(LEVELS.filter((level) => newsIsOn('numbers', level)), [8]);
  assert.deepEqual(LEVELS.filter((level) => newsIsOn('free', level)), [10]);
  for (const [key, [en, ka]] of Object.entries(LABELS)) assert.ok(en.length <= 30 && /[ა-ჰ]/.test(ka), `${key} has a short label in each language`);
  // Each level is its own picture, and levels outside 1 to 10 come back inside.
  assert.deepEqual(LEVELS.map((level) => paintLevel(level).page), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(paintLevel(0).page, 0);
  assert.equal(paintLevel(99).page, 9);
});

test('level 1 is the plain game, and so is a game with friends at any level: none of what the levels bring', () => {
  const plainOnes = [makePainting({ level: 1 }), ...LEVELS.map((level) => makePainting({ level, plain: true }))];
  for (const painting of plainOnes) {
    assert.ok(painting.pots.every((each) => each.kind === 'colour' && each.ready && each.colour !== RAINBOW), 'only pots of paint');
    assert.ok(painting.parts.every((each) => each.kind !== 'free' && each.colour !== RAINBOW && !each.magic));
    assert.deepEqual([painting.roller, painting.friend, painting.mirror, painting.numbers], [null, null, false, false]);
    hold(painting, 20, { x: 75, y: 50 }, false);
    assert.equal(painting.balloons.length, 0);
  }
  // With friends it's still the level's own picture.
  assert.equal(makePainting({ level: 6, plain: true }).page.id, 'butterfly');
});

test('level 2: rainbow paint has a pot of its own, and the part that asks for it takes that and nothing else', () => {
  const painting = makePainting({ level: 2 });
  const rainbow = pot(painting, RAINBOW);
  assert.ok(rainbow, 'a rainbow pot');
  assert.equal(painting.pots.at(-1), rainbow, 'at the end of the row');
  const balloon = part(painting, 'balloon-rainbow');
  assert.equal(balloon.colour, RAINBOW);
  // Purple doesn't land on it.
  dip(painting, 'purple');
  hold(painting, 0.5, { x: 75, y: 20 });
  assert.equal(balloon.covered, 0);
  // Rainbow does, and only there.
  dip(painting, RAINBOW);
  assert.equal(painting.brush.colour, RAINBOW);
  sweep(painting, { x: 20, y: 22 }, { x: 130, y: 22 });
  assert.ok(balloon.covered > 100);
  for (const each of painting.toPaint) if (each !== balloon) assert.equal(each.covered, 0, each.id);
  // Each stroke says how far along the brush has come, which is what the screen colours it by.
  const marks = painting.takeMarks().filter((mark) => mark.colour === RAINBOW);
  assert.ok(marks.length > 5);
  assert.ok(marks.at(-1).phase > marks[0].phase + 10);
  scrub(painting, 'balloon-rainbow');
  assert.equal(said(painting, 'part').at(-1).colour, RAINBOW);
  // Without what the levels bring, it's a balloon in a paint that has a pot.
  const plain = makePainting({ level: 2, plain: true });
  assert.equal(part(plain, 'balloon-rainbow').colour, 'purple');
  assert.equal(pot(plain, RAINBOW), undefined);
  assert.equal(makePainting({ level: 1 }).pots.some((each) => each.colour === RAINBOW), false);
});

test('level 3: with the star stamp, a hand held still prints a star, and it has to move on to print another', () => {
  const painting = makePainting({ level: 3 });
  const stamp = potOf(painting, 'stamp');
  assert.ok(stamp);
  dip(painting, 'stamp');
  assert.equal(painting.brush.tool, 'stamp');
  // Moving about prints nothing, and paints nothing.
  sweep(painting, { x: 20, y: 30 }, { x: 120, y: 80 });
  assert.equal(painting.stamps.length, 0);
  assert.ok(painting.toPaint.every((each) => each.covered === 0));
  assert.deepEqual(painting.takeMarks(), []);
  // Held still, not quite steadily: one star, where the hand is, after half a second and not before.
  const here = { x: 40, y: 30 };
  hold(painting, EXTRAS.stampSeconds - 0.1, here);
  assert.equal(painting.stamps.length, 0);
  assert.ok(painting.stamping.for > 0.2, 'the ring is closing');
  for (let t = 0; t < 0.3; t += FRAME) painting.update(FRAME, { at: { x: here.x + Math.sin(t * 30), y: here.y + Math.cos(t * 23) }, open: OPEN });
  assert.equal(painting.stamps.length, 1);
  assert.ok(Math.hypot(painting.stamps[0].x - 40, painting.stamps[0].y - 30) < EXTRAS.stampStill);
  // Still there: no more. Moved on and held: another.
  hold(painting, 3, here);
  assert.equal(painting.stamps.length, 1);
  hold(painting, 1, { x: 60, y: 40 });
  assert.equal(painting.stamps.length, 2);
  assert.equal(said(painting, 'stamp').length, 2);
  assert.equal(painting.stats.stamps, 2);
  // A closed hand prints nothing, and a paint pot puts the brush back.
  hold(painting, 2, { x: 100, y: 40 }, false);
  assert.equal(painting.stamps.length, 2);
  dip(painting, 'pink');
  assert.equal(painting.brush.tool, 'paint');
  hold(painting, 1, { x: 75, y: 80 });
  assert.equal(painting.stamps.length, 2);
  assert.ok(part(painting, 'tier-bottom').covered > 0);
  // There are never more than so many: the oldest goes.
  dip(painting, 'stamp');
  for (let i = 0; i < EXTRAS.stampsMost + 5; i += 1) {
    hold(painting, EXTRAS.stampSeconds + 0.1, { x: 10 + (i % 12) * 11, y: 10 + Math.floor(i / 12) * 12 });
  }
  assert.equal(painting.stamps.length, EXTRAS.stampsMost);
  // Stars are only for fun: the picture is no nearer done, and can still be finished.
  assert.equal(painting.stats.parts, 0);
  assert.equal(potOf(makePainting({ level: 2 }), 'stamp'), undefined);
});

test('level 4: the big brush lying on the sheet makes the brush much bigger for a while, which only runs down while it paints', () => {
  const painting = makePainting({ level: 4 });
  const { roller } = painting;
  assert.ok(roller && !roller.taken);
  assert.equal(painting.radius, BRUSHES.medium);
  // A hand coming near takes it, open or closed.
  hold(painting, 0.1, { x: roller.x + 5, y: roller.y - 4 }, false);
  assert.equal(roller.taken, true);
  assert.equal(said(painting, 'roller').length, 1);
  assert.equal(painting.radius, 14.3);
  assert.ok(Math.abs(painting.radius - BRUSHES.medium * EXTRAS.rollerScale) < 1e-9);
  // Resting, with the hand closed or away, it doesn't run down.
  hold(painting, 30, { x: 60, y: 90 }, false);
  hold(painting, 10, null, false);
  assert.equal(roller.left, EXTRAS.rollerSeconds);
  // One stroke of it paints far more than the ordinary brush does.
  const ordinary = makePainting({ level: 4, plain: true });
  dip(ordinary, 'blue');
  dip(painting, 'blue');
  for (const each of [ordinary, painting]) sweep(each, { x: 50, y: 92 }, { x: 110, y: 92 });
  assert.ok(part(painting, 'sea').covered > part(ordinary, 'sea').covered * 1.4);
  assert.ok(roller.left < EXTRAS.rollerSeconds && roller.left > EXTRAS.rollerSeconds - 3);
  // Used up after 10 seconds of painting in all, the brush is its own size again.
  hold(painting, 10, { x: 20, y: 20 });
  assert.equal(roller.left, 0);
  assert.equal(painting.radius, BRUSHES.medium);
  assert.equal(said(painting, 'roller-done').length, 1);
  assert.equal(makePainting({ level: 3 }).roller, null);
  // Each brush size is made bigger by the same amount.
  const big = makePainting({ level: 4, brush: 'big' });
  hold(big, 0.1, { x: big.roller.x, y: big.roller.y }, false);
  assert.ok(Math.abs(big.radius - BRUSHES.big * EXTRAS.rollerScale) < 1e-9);
});

test('level 5: someone is hiding in one part of the picture, and comes out once it\'s painted', () => {
  const painting = makePainting({ level: 5 });
  const bush = part(painting, 'bush');
  assert.equal(bush.magic, true);
  assert.deepEqual([painting.friend.mark, painting.friend.part, painting.friend.found], ['🐰', bush.index, false]);
  assert.equal(painting.toPaint.filter((each) => each.magic).length, 1);
  assert.equal(painting.brush.colour, 'green');
  scrub(painting, 'bush', { until: () => share(bush) > 0.5 });
  assert.equal(painting.friend.found, false, 'not until it\'s done');
  scrub(painting, 'bush');
  assert.equal(painting.friend.found, true);
  assert.equal(said(painting, 'friend').length, 1);
  assert.equal(painting.stats.friends, 1);
  // Each picture from here on hides someone different.
  const hiding = [5, 7, 8, 9, 10].map((level) => makePainting({ level }).friend?.mark);
  assert.equal(new Set(hiding).size, 5);
  assert.ok(hiding.every(Boolean));
  assert.equal(makePainting({ level: 4 }).friend, null);
});

test('level 6: on the butterfly, what\'s painted on one wing is painted on the other at the same time', () => {
  const painting = makePainting({ level: 6 });
  assert.equal(painting.mirror, true);
  assert.equal(painting.brush.colour, 'blue');
  const [left, right] = [part(painting, 'wing-top-left'), part(painting, 'wing-top-right')];
  assert.ok(Math.abs(left.cells - right.cells) <= 2, 'the two wings are the same');
  sweep(painting, { x: 20, y: 20 }, { x: 50, y: 40 });
  assert.ok(left.covered > 100);
  assert.ok(Math.abs(right.covered - left.covered) <= 2, 'the same paint on the other wing');
  assert.equal(paintOn(painting, 22, 21), 'blue');
  assert.equal(paintOn(painting, SHEET.width - 22, 21), 'blue');
  // The yellow spot the stroke went across took none of it, on either wing.
  assert.equal(paintOn(painting, 35, 30), null);
  assert.equal(paintOn(painting, SHEET.width - 35, 30), null);
  // Each stroke is kept twice for the screen, once on each side.
  const marks = painting.takeMarks();
  assert.ok(marks.some((mark) => mark.x1 < 75 && mark.parts.includes(left.index)) && marks.some((mark) => mark.x1 > 75 && mark.parts.includes(right.index)));
  // One wing painted, both are done.
  scrub(painting, 'wing-top-left');
  assert.ok(left.done && right.done);
  // With free painting too, each side stays inside its own part.
  const free = makePainting({ level: 6, rule: 'free' });
  dip(free, 'pink');
  sweep(free, { x: 30, y: 24 }, { x: 36, y: 30 });
  assert.ok(part(free, 'spot-big-left').covered > 30);
  assert.ok(Math.abs(part(free, 'spot-big-right').covered - part(free, 'spot-big-left').covered) <= 2);
  assert.equal(part(free, 'wing-top-right').covered, 0);
  // Any other picture is painted one side at a time.
  const other = makePainting({ level: 5 });
  assert.equal(other.mirror, false);
  assert.equal(makePainting({ level: 6, plain: true }).mirror, false);
});

test('level 7: two paints dipped into the mixing dish make a new one, which the brush takes and which has a pot from then on', () => {
  assert.equal(mixOf('red', 'yellow'), 'orange');
  assert.equal(mixOf('yellow', 'blue'), 'green');
  assert.equal(mixOf('blue', 'red'), 'purple');
  assert.equal(mixOf('red', 'red'), null);
  assert.equal(mixOf('red', 'brown'), null);
  assert.deepEqual(recipeFor('green').sort(), ['blue', 'yellow']);
  assert.equal(recipeFor('red'), null);
  assert.ok(mixes('red') && mixes('blue') && mixes('yellow') && !mixes('orange') && !mixes(RAINBOW));

  const painting = makePainting({ level: 7 });
  const dish = potOf(painting, 'dish');
  assert.ok(dish);
  // Pots of red, yellow and blue, and an empty place each for orange and green, which can't be dipped into yet.
  assert.deepEqual(painting.pots.filter((each) => each.kind === 'colour').map((each) => [each.colour, each.ready]), [['red', true], ['yellow', true], ['blue', true], ['orange', false], ['green', false]]);
  const orange = pot(painting, 'orange');
  hold(painting, 1, { x: orange.x, y: orange.y });
  assert.equal(painting.brush.colour, 'red');
  // Red into the dish, where it waits. Red again changes nothing.
  dip(painting, 'dish');
  assert.equal(dish.holds, 'red');
  assert.equal(painting.brush.colour, 'red');
  dip(painting, 'dish');
  assert.equal(dish.holds, 'red');
  // Yellow into it: orange, on the brush and in a pot of its own, and the dish is empty again.
  dip(painting, 'yellow');
  dip(painting, 'dish');
  assert.equal(painting.brush.colour, 'orange');
  assert.equal(dish.holds, null);
  assert.equal(orange.ready, true);
  assert.deepEqual(said(painting, 'mix').map((event) => [event.colour, event.from, event.into]), [['orange', ['red', 'yellow'], orange]]);
  assert.equal(painting.stats.mixes, 1);
  // It paints the parts that ask for orange, and its pot works like any other now.
  scrub(painting, 'flame');
  assert.ok(part(painting, 'flame').done);
  dip(painting, 'blue');
  dip(painting, 'orange');
  assert.equal(painting.brush.colour, 'orange');
  // A paint that makes nothing new doesn't go in the dish, and nor does the stamp.
  dip(painting, 'dish');
  assert.equal(dish.holds, null);
  assert.equal(said(painting, 'dish-no').length, 1);
  dip(painting, 'stamp');
  dip(painting, 'dish');
  assert.equal(dish.holds, null);
  // Blue and yellow, in either order, make green.
  dip(painting, 'yellow');
  dip(painting, 'dish');
  dip(painting, 'blue');
  dip(painting, 'dish');
  assert.equal(painting.brush.colour, 'green');
  assert.equal(pot(painting, 'green').ready, true);
  // Without the dish, as with friends, every paint the picture asks for has its pot.
  const plain = makePainting({ level: 7, plain: true });
  assert.ok(pot(plain, 'orange').ready && pot(plain, 'green').ready);
  assert.equal(potOf(plain, 'dish'), undefined);
  assert.equal(potOf(makePainting({ level: 6 }), 'dish'), undefined);
});

test('level 7: a part that wants a mixed paint shows the two pots and the dish, and a child who is stuck is given it, with its pot', () => {
  const painting = makePainting({ level: 7 });
  const grass = part(painting, 'grass');
  hold(painting, 1, { x: 20, y: 96 });
  assert.equal(grass.covered, 0);
  assert.deepEqual(painting.hint.recipe.slice().sort(), ['blue', 'yellow']);
  assert.deepEqual(painting.hint.pots, [pot(painting, 'blue').index, pot(painting, 'yellow').index, potOf(painting, 'dish').index].sort((a, b) => (a === potOf(painting, 'dish').index ? 1 : b === potOf(painting, 'dish').index ? -1 : painting.hint.recipe.indexOf(painting.pots[a].colour) - painting.hint.recipe.indexOf(painting.pots[b].colour))));
  assert.equal(painting.hint.pots.at(-1), potOf(painting, 'dish').index, 'the dish last, where the drops lead');
  hold(painting, EXTRAS.helpAfter, { x: 20, y: 96 });
  assert.equal(painting.brush.colour, 'green');
  assert.equal(pot(painting, 'green').ready, true, 'and its pot is there from now on');
  assert.ok(grass.covered > 0);
});

test('level 8: the robot is coloured by numbers, each part\'s number the same as its pot\'s', () => {
  const painting = makePainting({ level: 8 });
  assert.equal(painting.numbers, true);
  const pots = painting.pots.filter((each) => each.kind === 'colour');
  assert.deepEqual(pots.map((each) => each.number), [1, 2, 3, 4, 5, 6]);
  for (const each of painting.toPaint) {
    assert.equal(painting.numberOf(each.colour), pot(painting, each.colour).number, each.id);
    assert.ok(painting.numberOf(each.colour) >= 1);
  }
  // The same rule as ever: only the pot with a part's number paints it.
  const head = part(painting, 'head');
  const wrong = pots.find((each) => each.colour !== head.colour);
  dip(painting, wrong);
  hold(painting, 1, { x: head.dot.x, y: head.dot.y });
  assert.equal(head.covered, 0);
  assert.deepEqual(painting.hint.pots, [pot(painting, head.colour).index]);
  dip(painting, head.colour);
  hold(painting, 0.2, { x: head.dot.x, y: head.dot.y });
  assert.ok(head.covered > 0);
  // No other picture has numbers.
  for (const level of LEVELS.filter((each) => each !== 8)) {
    const other = makePainting({ level });
    assert.equal(other.numbers, false);
    assert.ok(other.pots.every((each) => each.number === undefined));
    assert.equal(other.numberOf(other.brush.colour), null);
  }
});

test('level 9: paint balloons come to the parts with the most still to paint, and one touched splashes its paint over its part', () => {
  const painting = makePainting({ level: 9 });
  assert.equal(painting.balloons.length, 0);
  // They come one at a time, a few seconds apart, and only so many at once. Resting brings no more than that.
  hold(painting, 2, null, false);
  assert.equal(painting.balloons.length, 1);
  hold(painting, 60, null, false);
  assert.equal(painting.balloons.length, EXTRAS.balloonsAtOnce);
  assert.equal(said(painting, 'balloon-new').length, EXTRAS.balloonsAtOnce);
  // Each is over a different part, the biggest ones first, on a place that's still to paint.
  const parts = painting.balloons.map((balloon) => painting.parts[balloon.part]);
  assert.equal(new Set(parts).size, EXTRAS.balloonsAtOnce);
  assert.equal(parts[0], painting.toPaint.slice().sort((a, b) => b.cells - a.cells)[0]);
  for (const balloon of painting.balloons) {
    assert.equal(painting.partAt(balloon.x, balloon.y), balloon.part);
    assert.equal(paintOn(painting, balloon.x, balloon.y), null);
  }
  // A hand coming near one, open or closed, bursts it: a big splash of its part's own paint, in that part only.
  const [balloon] = painting.balloons;
  const before = painting.toPaint.map((each) => each.covered);
  hold(painting, 0.1, { x: balloon.x + 3, y: balloon.y - 3 }, false);
  assert.equal(balloon.popped, true);
  assert.equal(said(painting, 'balloon').length, 1);
  const splashed = painting.parts[balloon.part];
  assert.ok(splashed.covered > 250, `a big splash (${splashed.covered})`);
  assert.equal(paintOn(painting, balloon.x, balloon.y), splashed.colour);
  painting.toPaint.forEach((each, index) => {
    if (each !== splashed) assert.equal(each.covered, before[index], `${each.id} is untouched`);
  });
  const [mark] = painting.takeMarks();
  assert.deepEqual([mark.r, mark.colour, mark.parts], [EXTRAS.splat, splashed.colour, [splashed.index]]);
  // Another comes in its place after a while, and never more in a picture than so many.
  hold(painting, EXTRAS.balloonEvery + 1, null, false);
  assert.equal(painting.balloons.filter((each) => !each.popped).length, EXTRAS.balloonsAtOnce);
  for (let i = 0; i < 12; i += 1) {
    const next = painting.balloons.find((each) => !each.popped);
    if (!next) break;
    hold(painting, 0.1, { x: next.x, y: next.y }, false);
    hold(painting, EXTRAS.balloonEvery + 1, null, false);
  }
  assert.equal(painting.balloons.length, EXTRAS.balloonsMost);
  assert.equal(painting.stats.balloons, EXTRAS.balloonsMost);
  // A balloon whose part gets finished by the brush goes by itself.
  const other = makePainting({ level: 9 });
  hold(other, 2, null, false);
  const first = other.balloons[0];
  const sea = other.parts[first.part];
  assert.equal(sea.id, 'sea');
  // Painted from the far end, away from the balloon, so the brush doesn't burst it.
  for (let cell = other.owner.length - 1; cell >= 0 && !sea.done; cell -= 1) {
    if (other.owner[cell] !== sea.index || other.paint[cell]) continue;
    const at = { x: (cell % SHEET.width) + 0.5, y: Math.floor(cell / SHEET.width) + 0.5 };
    if (Math.hypot(at.x - first.x, at.y - first.y) > 12) other.update(FRAME, { at, open: OPEN });
  }
  assert.ok(sea.done && first.popped);
  assert.equal(said(other, 'balloon-gone').length, 1);
  assert.equal(other.stats.balloons, 0);
  // None before level 9.
  const early = makePainting({ level: 8 });
  hold(early, 30, null, false);
  assert.equal(early.balloons.length, 0);
});

test('level 10: the space to draw in takes any paint, is done once something is drawn in it, and stays as it was drawn', () => {
  const painting = makePainting({ level: 10, brush: 'small' });
  const canvas = part(painting, 'canvas');
  assert.equal(canvas.kind, 'free');
  assert.equal(canvas.need, FREE_SHARE);
  // Whatever paint is on the brush goes down in it, and it never asks for another.
  for (const [colour, y] of [['red', 40], ['blue', 52], [RAINBOW, 64]]) {
    dip(painting, colour);
    sweep(painting, { x: 48, y }, { x: 58, y });
    assert.equal(paintOn(painting, 54, y), colour);
    assert.equal(painting.hint, null);
  }
  assert.equal(canvas.done, false);
  // Paint from it never goes over into the frame round it.
  assert.equal(part(painting, 'frame').covered, 0);
  // A quarter of it drawn in is enough, and the rest stays bare: it doesn't fill itself in.
  away(painting);
  sweep(painting, { x: 48, y: 46 }, { x: 102, y: 46 });
  assert.equal(canvas.done, true);
  assert.ok(share(canvas) >= FREE_SHARE && share(canvas) < 0.5);
  assert.equal(paintOn(painting, 100, 70), null);
  assert.equal(paintOn(painting, 54, 38), 'red', 'what was drawn is still there');
  // It can be drawn in some more afterwards.
  sweep(painting, { x: 86, y: 70 }, { x: 102, y: 70 });
  assert.equal(paintOn(painting, 100, 70), RAINBOW);
  // Without it, as with friends, it's white paper in its frame.
  assert.equal(part(makePainting({ level: 10, plain: true }), 'canvas').kind, 'paper');
});

for (const rule of ['own', 'free']) {
  test(`a pretend child with a hand that isn't steady finishes every level, ${rule === 'own' ? 'dipping for each paint' : 'painting freely'}, and nobody is ever stuck`, () => {
    const times = [];
    const dipsAMinute = [];
    for (const level of LEVELS) {
      const painting = makePainting({ level, rule });
      const took = playThrough(painting);
      assert.ok(painting.done, `level ${level} gets finished`);
      assert.equal(painting.stats.helped, 0, `level ${level}: without needing help`);
      assert.equal(painting.stats.parts, painting.toPaint.length);
      assert.ok(painting.toPaint.every((each) => each.done));
      assert.equal(said(painting, 'done').length, 1);
      times.push(took);
      dipsAMinute.push(painting.stats.dips / (took / 60));
    }
    // No level takes more than about a third longer than level 1, or asks for more than about twice as many dips a minute.
    for (const level of LEVELS) {
      assert.ok(times[level - 1] <= times[0] * 1.4 + (rule === 'free' ? 8 : 0), `level ${level} takes ${times[level - 1].toFixed(0)} seconds, level 1 ${times[0].toFixed(0)}`);
      if (rule === 'own') assert.ok(dipsAMinute[level - 1] <= dipsAMinute[0] * 2.1, `level ${level}: ${dipsAMinute[level - 1].toFixed(1)} dips a minute, level 1 ${dipsAMinute[0].toFixed(1)}`);
    }
    assert.ok(times[0] > 12 && times[0] < 60, `level 1 takes ${times[0].toFixed(0)} seconds`);
  });
}

test('a child who rests half the time, and one with the smallest brush and the most to paint, still finish, and resting costs nothing', () => {
  const steady = makePainting({ level: 5 });
  const resting = makePainting({ level: 5 });
  const took = playThrough(steady);
  // Ten seconds on, ten seconds off: the same picture, in about twice the time, with nothing lost in between.
  const rested = playThrough(resting, { seconds: 800, rests: (t) => t % 20 >= 10 });
  assert.ok(resting.done);
  assert.ok(rested < took * 2 + 40, `${rested.toFixed(0)} seconds with rests, ${took.toFixed(0)} without`);
  assert.equal(resting.stats.parts, steady.stats.parts);
  assert.equal(resting.stats.helped, 0);
  // The hardest the settings go, and a slow, wobbly hand.
  const hard = makePainting({ level: 10, brush: 'small', done: 'all' });
  playThrough(hard, { speed: 25, wobble: 3, seconds: 900 });
  assert.ok(hard.done);
  // And the easiest.
  const easy = makePainting({ level: 1, brush: 'big', done: 'some' });
  assert.ok(playThrough(easy) < took);
});

test('a level never changes what a grown-up chose: the brush, how much is enough, and the rule for the paints', () => {
  for (const level of LEVELS) {
    for (const [brush, done, rule] of [['small', 'all', 'own'], ['big', 'some', 'free']]) {
      const painting = makePainting({ level, brush, done, rule });
      assert.equal(painting.size, BRUSHES[brush]);
      assert.equal(painting.radius, BRUSHES[brush]);
      assert.equal(painting.share, DONE_SHARES[done]);
      assert.equal(painting.rule, rule);
      assert.ok(painting.toPaint.filter((each) => each.kind === 'part').every((each) => each.need === DONE_SHARES[done]));
    }
  }
});

/* ---------- with friends ---------- */

test('how a game with friends is to be played goes as one word, and anything else is the usual', () => {
  assert.equal(modeWord('own', 'most'), 'ownMost');
  assert.equal(modeWord('free', 'all'), 'freeAll');
  assert.equal(modeWord('nonsense', 'nonsense'), 'ownMost');
  for (const rule of ['own', 'free']) {
    for (const done of Object.keys(DONE_SHARES)) {
      const word = modeWord(rule, done);
      assert.match(word, /^[A-Za-z]{1,12}$/, 'a word the server passes on');
      assert.deepEqual(readMode(word), { rule, done });
    }
  }
  for (const junk of ['', 'slow', 'ownEverything', undefined]) assert.deepEqual(readMode(junk), { rule: 'own', done: 'most' });
});

/** Two children painting the same sheet, each with their own game, and what passes between them. */
function together(options = {}) {
  const claims = [];
  const make = (me) => {
    const painting = makePainting({ level: 4, plain: true, me, shared: { claim: (k) => claims.push({ k, by: me }) }, ...options });
    return painting;
  };
  const [ana, ben] = [make('ana'), make('ben')];
  /** What one game has painted goes to the other, as the numbers a message would hold. */
  const send = (from, to) => {
    let sent = 0;
    for (let numbers = from.takeStrokes(); numbers.length; numbers = from.takeStrokes()) {
      assert.ok(numbers.length <= STROKE_NUMBERS, 'no more numbers than a message holds');
      to.friendStrokes(JSON.parse(JSON.stringify(numbers)));
      sent += 1;
    }
    return sent;
  };
  /** The server says whose each claim is: the first to claim a part has it, and everyone hears. */
  const settle = () => {
    const owners = new Map();
    for (const { k, by } of claims) if (!owners.has(k)) owners.set(k, by);
    for (const [k, by] of owners) for (const each of [ana, ben]) each.claimed(k, by);
    return owners;
  };
  return { ana, ben, send, settle, claims };
}

test('together: each child\'s strokes are painted on the other\'s sheet too, so both end up the same', () => {
  const { ana, ben, send } = together();
  dip(ana, 'blue');
  sweep(ana, { x: 10, y: 90 }, { x: 70, y: 94 });
  assert.equal(part(ben, 'sea').covered, 0, 'nothing until it arrives');
  assert.ok(send(ana, ben) >= 1);
  assert.equal(part(ben, 'sea').covered, part(ana, 'sea').covered);
  assert.deepEqual(ben.paint, ana.paint);
  // They're kept for Ben's screen to draw, as his own are, and don't count as his painting.
  const marks = ben.takeMarks();
  assert.ok(marks.length > 3 && marks.every((mark) => mark.colour === 'blue' && mark.parts.includes(part(ben, 'sea').index)));
  assert.equal(ben.stats.cells, 0);
  assert.ok(ana.stats.cells > 0);
  // Ben paints somewhere else, with another paint, at the same time: each has both.
  dip(ben, 'red');
  sweep(ben, { x: 64, y: 60 }, { x: 86, y: 60 });
  sweep(ana, { x: 80, y: 92 }, { x: 140, y: 92 });
  send(ben, ana);
  send(ana, ben);
  assert.deepEqual(ben.paint, ana.paint);
  assert.ok(part(ana, 'stripe-bottom').covered > 0);
  // Nothing more to send once it's all gone.
  assert.deepEqual(ana.takeStrokes(), []);
  // With free painting, a stroke stays in the part its own child was in, on the friend's sheet too.
  const free = together({ rule: 'free' });
  dip(free.ana, 'red');
  sweep(free.ana, { x: 20, y: 86 }, { x: 60, y: 96 });
  free.send(free.ana, free.ben);
  assert.deepEqual(free.ben.paint, free.ana.paint);
  assert.ok(part(free.ben, 'sea').covered > 100);
  assert.equal(paintOn(free.ben, 40, 92), 'red');
});

test('together: a long stroke goes in several messages and nothing of it is lost, and anything that isn\'t a stroke is ignored', () => {
  const { ana, ben, send } = together();
  dip(ana, 'blue');
  // A whole page of scribble before anything is sent, as when the connection is slow.
  for (let row = 0; row < 6; row += 1) sweep(ana, { x: row % 2 ? 140 : 10, y: 82 + row * 3 }, { x: row % 2 ? 10 : 140, y: 82 + row * 3 }, { speed: 30 });
  assert.ok(send(ana, ben) > 5, 'more than one message');
  assert.deepEqual(ben.paint, ana.paint);
  // Junk from the wire paints nothing and breaks nothing.
  const before = ben.paint.slice();
  for (const junk of [null, 'strokes', {}, [1, 2], [-1, 4, 6.5, 3, 10, 90], [99, 4, 6.5, 1, 10, 90], [-1, 77, 6.5, 1, 10, 90], [-1, 4, 0, 1, 10, 90], [-1, 4, 6.5, 2.5, 10, 90, 20, 90], [-1, 4, 999, 1, 10, 50], [0.5, 4, 6.5, 1, 20, 20], [-1, 4, 6.5, 1, 'x', 90]]) {
    ben.friendStrokes(junk);
  }
  assert.deepEqual(ben.paint, before);
  // A paper part can't be painted by naming it.
  ben.friendStrokes([part(ben, 'tower').index, 0, 6.5, 1, 75, 49]);
  assert.equal(paintOn(ben, 75, 49), null);
  // A proper one still works after all that.
  ben.friendStrokes([-1, COLOUR_NAMES.indexOf('orange'), 6.5, 2, 18, 18, 26, 20]);
  assert.equal(paintOn(ben, 22, 19), 'orange');
});

test('together: whoever\'s stroke finishes a part claims it, the server says whose it is, and it\'s done on every sheet', () => {
  const { ana, ben, send, settle, claims } = together();
  dip(ana, 'orange');
  scrub(ana, 'sun');
  assert.ok(part(ana, 'sun').done);
  assert.deepEqual(claims, [{ k: part(ana, 'sun').index, by: 'ana' }]);
  // Ben hasn't heard a thing yet: it's still to do on his sheet. The server's word finishes it there.
  assert.equal(part(ben, 'sun').done, false);
  settle();
  assert.equal(part(ben, 'sun').done, true);
  assert.equal(said(ben, 'part').at(-1).mine, false);
  assert.deepEqual([...ana.tally], [['ana', 1]]);
  assert.deepEqual([...ben.tally], [['ana', 1]]);
  // A part Ana's strokes finish on Ben's sheet isn't claimed by Ben: it was hers.
  dip(ana, 'yellow');
  scrub(ana, 'lamp');
  send(ana, ben);
  assert.ok(part(ben, 'lamp').done);
  assert.equal(claims.filter((each) => each.by === 'ben').length, 0);
  // Both finishing the same part at once: it's the first claim's, on both sheets, and counted once.
  dip(ana, 'red');
  dip(ben, 'red');
  scrub(ana, 'roof');
  scrub(ben, 'roof');
  const owners = settle();
  assert.equal(owners.get(part(ana, 'roof').index), 'ana');
  assert.deepEqual([...ana.tally], [['ana', 3]]);
  assert.deepEqual([...ben.tally], [['ana', 3]]);
  // Said again, it counts no more.
  ana.claimed(part(ana, 'roof').index, 'ben');
  assert.deepEqual([...ana.tally], [['ana', 3]]);
  // A claim for something that isn't a part to paint is nothing.
  ana.claimed(99, 'ben');
  ana.claimed(part(ana, 'tower').index, 'ben');
  assert.deepEqual([...ana.tally], [['ana', 3]]);
});

test('together: a part finished on each sheet by the other\'s strokes, so nobody\'s own stroke finished it, is still somebody\'s', () => {
  const { ana, ben, send, settle, claims } = together();
  dip(ana, 'orange');
  dip(ben, 'orange');
  const sun = part(ana, 'sun');
  // Each paints a little under half of the sun, Ana from the top and Ben from the bottom.
  scrub(ana, 'sun', { until: () => part(ana, 'sun').covered >= sun.cells * 0.45 });
  const cells = [...ben.owner.keys()].filter((cell) => ben.owner[cell] === sun.index).reverse();
  for (const cell of cells) {
    if (part(ben, 'sun').covered >= sun.cells * 0.45) break;
    if (!ben.paint[cell]) ben.update(FRAME, { at: { x: (cell % SHEET.width) + 0.5, y: Math.floor(cell / SHEET.width) + 0.5 }, open: OPEN });
  }
  away(ben);
  assert.ok(!part(ana, 'sun').done && !part(ben, 'sun').done);
  // Each one's strokes arrive at the other's sheet and finish it there, so neither stroke was the finisher's own.
  send(ana, ben);
  send(ben, ana);
  assert.ok(part(ana, 'sun').done && part(ben, 'sun').done);
  assert.equal(claims.length, 0);
  // A moment later both claim it, as both painted some, and the server gives it to the first: it's counted once.
  hold(ana, CLAIM_LATE + 0.1, null);
  hold(ben, CLAIM_LATE + 0.1, null);
  assert.deepEqual(claims.map(({ by }) => by), ['ana', 'ben']);
  settle();
  assert.deepEqual([...ana.tally], [['ana', 1]]);
  assert.deepEqual([...ben.tally], [['ana', 1]]);
  // Nothing more is claimed after that, and a part done by someone else that this child never touched isn't claimed.
  dip(ana, 'blue');
  scrub(ana, 'sea');
  send(ana, ben);
  settle();
  hold(ben, CLAIM_LATE + 0.1, null);
  assert.equal(claims.filter((each) => each.by === 'ben').length, 1);
  assert.deepEqual([...ben.tally], [['ana', 2]]);
});

test('together: which parts are done goes as one number, and a friend who missed some strokes still gets the parts they finished', () => {
  const { ana, ben } = together();
  assert.equal(ana.doneBits(), 0);
  dip(ana, 'orange');
  scrub(ana, 'sun');
  dip(ana, 'blue');
  scrub(ana, 'sea');
  const bits = ana.doneBits();
  assert.equal(bits, 2 ** part(ana, 'sun').index + 2 ** part(ana, 'sea').index);
  // Ben never got the strokes, as when the connection dropped. Hearing which parts are done, they are on his sheet too.
  ana.takeStrokes(100_000);
  ben.learnDone(bits);
  assert.ok(part(ben, 'sun').done && part(ben, 'sea').done);
  assert.equal(paintOn(ben, 22, 19), 'orange', 'in the paint it asks for');
  assert.equal(ben.doneBits(), bits);
  assert.equal(ben.stats.parts, 2);
  // Nonsense finishes nothing.
  for (const junk of [0, -5, NaN, undefined, 'all']) ben.learnDone(junk);
  assert.equal(ben.stats.parts, 2);
  // Between them they finish the picture, and it's done for both.
  const { ana: a, ben: b, send, settle } = together();
  playThrough(a, { seconds: 15 });
  send(a, b);
  settle();
  playThrough(b);
  send(b, a);
  settle();
  a.learnDone(b.doneBits());
  assert.ok(a.done && b.done);
  assert.equal(a.tally.get('ana') + a.tally.get('ben'), a.toPaint.length);
  assert.deepEqual([...a.tally].sort(), [...b.tally].sort());
});

test('with a connection that\'s down for a long while, what\'s kept to send never grows without end', () => {
  const { ana } = together();
  dip(ana, 'blue');
  for (let i = 0; i < 400; i += 1) sweep(ana, { x: i % 2 ? 140 : 10, y: 90 }, { x: i % 2 ? 10 : 140, y: 90 }, { speed: 60 });
  let numbers = 0;
  for (let each = ana.takeStrokes(); each.length; each = ana.takeStrokes()) numbers += each.length;
  assert.ok(numbers > 500 && numbers <= 2600, `${numbers} numbers kept`);
});

test('the strokes a game sends fit in one message, come through the server unchanged, and paint the same on the other side', () => {
  assert.ok(STROKE_NUMBERS <= MOST_STROKE_NUMBERS, 'no more numbers than the server passes on');
  const { ana, ben } = together({ level: 9 });
  dip(ana, 'blue');
  for (let row = 0; row < 3; row += 1) sweep(ana, { x: row % 2 ? 140 : 10, y: 88 + row * 4 }, { x: row % 2 ? 10 : 140, y: 88 + row * 4 });
  let messages = 0;
  for (let numbers = ana.takeStrokes(); numbers.length; numbers = ana.takeStrokes()) {
    const sent = JSON.stringify({ t: 'brush', ms: 123456, x: 75.5, y: 90.1, v: 1, o: 1, c: 4, r: 6.5, p: Array(42).fill(-1.23), s: numbers, d: ana.doneBits() });
    assert.ok(sent.length <= MOST_BYTES, `${sent.length} characters, which the server takes`);
    const heard = cleanBrush(JSON.parse(sent));
    assert.deepEqual(heard.s, numbers, 'nothing changed on the way');
    ben.friendStrokes(heard.s);
    ben.learnDone(heard.d);
    messages += 1;
  }
  assert.ok(messages >= 2);
  assert.deepEqual(ben.paint, ana.paint);
});

test('the paint box\'s rooms are known to both servers, hold four, and a friend\'s brush is passed on to the game', () => {
  assert.equal(mostIn('giraffe-paint'), MAX_RACERS);
  for (const file of ['../../server/worker.js', '../../tools/race-server.mjs']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /const GAMES = \[[^\]]*'giraffe-paint'/, file);
  }
  const friends = readFileSync(new URL('../../core/friends.js', import.meta.url), 'utf8');
  assert.match(friends, /'brush'[^\]]*\]\.includes\(message\.t\)/);
  // The game makes its rooms under the same name, and sends nothing a friend's game doesn't clean.
  const main = readFileSync(new URL('../../games/giraffe-paint/main.js', import.meta.url), 'utf8');
  assert.match(main, /game: 'giraffe-paint'/);
  assert.match(main, /t: 'brush'/);
});

test('every line the game says has its English and Georgian voice files, and the game says each one', () => {
  const folder = new URL('../../games/giraffe-paint/audio/voice/', import.meta.url);
  const lines = JSON.parse(readFileSync(new URL('lines.json', folder), 'utf8'));
  assert.ok(lines.length >= 6);
  for (const { id, ka } of lines) {
    assert.ok(/[ა-ჰ]/.test(ka), `${id} has Georgian`);
    for (const language of ['en', 'ka']) assert.ok(readFileSync(new URL(`${language}/${id}.ogg`, folder)).length > 1000, `${language}/${id}.ogg`);
  }
  const source = readFileSync(new URL('../../games/giraffe-paint/main.js', import.meta.url), 'utf8');
  for (const { text } of lines) assert.ok(source.includes(text), `"${text}" is said by the game`);
});

/* ---------- the other painter ---------- */

const contest = (options = {}) => makePainting({ rival: 'contest', ...options });

test('on their own another painter paints the same picture while the hand is in the picture, and waits while it isn\'t', () => {
  const painting = contest({ level: 1 });
  const { rival } = painting;
  assert.ok(rival && rival.who === RIVAL_PAINTERS[0] && rival.who !== 'giraffe');
  assert.ok(rival.seconds > 100, `${rival.seconds} s at level 1`);
  for (let t = 0; t < 120; t += FRAME) away(painting);
  assert.equal(rival.progress, 0);
  // A hand in the picture, painting or resting closed: they paint on.
  hold(painting, 10, { x: 75, y: 50 }, false);
  assert.ok(Math.abs(rival.progress - 10 / rival.seconds) < 0.01, `${rival.progress}`);
});

test('the other painter finishing first ends the contest, lost, and nothing more is painted', () => {
  const painting = contest({ level: 1 });
  let t = 0;
  for (; t < 400 && !painting.lost; t += FRAME) painting.update(FRAME, { at: { x: 75, y: 50 }, open: false });
  assert.ok(Math.abs(t - painting.rival.seconds) < 0.05, `beaten after ${t} s`);
  assert.equal(said(painting, 'beaten').length, 1);
  assert.deepEqual([painting.lost, painting.done], [true, false]);
  const cells = painting.stats.cells;
  playThrough(painting, { seconds: 5 });
  assert.equal(painting.stats.cells, cells);
  assert.equal(painting.done, false);
});

test('in a contest the brush is never given the right paint: the part only shows which pot it wants', () => {
  const painting = contest({ level: 1 });
  // Yellow on the orange muzzle, for a long while: still yellow, nothing lands, and the hint stays up.
  hold(painting, EXTRAS.helpAfter + 3, { x: 63, y: 72 });
  assert.equal(painting.stats.helped, 0);
  assert.equal(painting.brush.colour, 'yellow');
  assert.equal(part(painting, 'muzzle').covered, 0);
  assert.equal(painting.hint?.colour, 'orange');
});

test('a quick painter beats the other painter at every level, and a slow one does at level 1 and not at level 10', () => {
  for (const level of LEVELS) {
    const painting = contest({ level, brush: 'small' });
    playThrough(painting, { speed: 100 });
    assert.ok(painting.done && !painting.lost, `level ${level}: ${painting.lost ? 'beaten' : 'not done'}`);
  }
  const first = contest({ level: 1, brush: 'small' });
  playThrough(first, { speed: 20 });
  assert.ok(first.done && !first.lost, 'level 1, slowly');
  const last = contest({ level: 10, brush: 'small' });
  playThrough(last, { speed: 20 });
  assert.equal(last.lost, true, 'level 10, slowly');
  // They're quicker each level, and at level 10 take under a third of level 1's time.
  const times = LEVELS.map((level) => contest({ level }).rival.seconds);
  for (const level of LEVELS.slice(1)) assert.ok(times[level - 1] < times[level - 2]);
  assert.ok(times[9] < times[0] / 3, `${times[0]} s and ${times[9]} s`);
});

test('the gentle picture, and painting with friends, have nobody to beat', () => {
  assert.equal(makePainting({ rival: 'gentle' }).rival, null);
  assert.equal(makePainting({ rival: 'contest', plain: true, shared: { claim: () => {} } }).rival, null);
  const gentle = makePainting({ rival: 'gentle', level: 10 });
  hold(gentle, 300, { x: 75, y: 50 }, false);
  assert.equal(gentle.lost, false);
});

test('the grown-ups\' settings: the contest and the small brush come first, and the gentle picture can be chosen', () => {
  const source = readFileSync(new URL('../../games/giraffe-paint/main.js', import.meta.url), 'utf8');
  assert.match(source, /defaults: \{ paintBrush: 'small', paintDone: 'most', paintRival: 'contest', /);
  assert.match(source, /choice\('paintRival', 'gentle', 'Gentle: /);
});
