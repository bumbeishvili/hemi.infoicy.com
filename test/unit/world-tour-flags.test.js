// Giraffe's World Tour: the 31 flags a child colours in, as shapes. Each flag has its parts, its colours and its names,
// covers itself with no gaps, shows every part, and has the right colour on top at named places, from each flag's
// official construction. Sampling is on a grid of half a unit, at the middle of each little square.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FLAGS, HIGH, partAt, windingOf } from '../../games/world-tour/flags.js';
import { boxOf, inShape, starPoints } from '../../games/world-tour/shapes.js';

const CODES = ['UKR', 'POL', 'DEU', 'FRA', 'ITA', 'IRL', 'GEO', 'ARM', 'AZE', 'SWE', 'FIN', 'NOR', 'AUT', 'CZE', 'CHE', 'JPN', 'VNM',
  'THA', 'NGA', 'GHA', 'BWA', 'COL', 'PER', 'CHL', 'GRC', 'TUR', 'BGR', 'CHN', 'ZAF', 'USA', 'GBR'];
const STEP = 0.5;
const SHAPE_TYPES = ['rect', 'poly', 'circle', 'star', 'crescent'];

// Each flag's length for a height of 100, from its official proportions.
const WIDE = {
  UKR: 150, POL: 160, DEU: 500 / 3, FRA: 150, ITA: 150, IRL: 200, GEO: 150, ARM: 200, AZE: 200, SWE: 160, FIN: 1800 / 11,
  NOR: 137.5, AUT: 150, CZE: 150, CHE: 100, JPN: 150, VNM: 150, THA: 150, NGA: 200, GHA: 150, BWA: 150, COL: 150, PER: 150,
  CHL: 150, GRC: 150, TUR: 150, BGR: 500 / 3, CHN: 150, ZAF: 150, USA: 190, GBR: 200,
};

/** Every little square's middle on a flag, with the part on top there and which of its shapes hold it. */
function survey(flag) {
  const shown = new Map(flag.parts.map((part) => [part, 0]));
  const shapesShown = new Set();
  const gaps = [];
  for (let y = STEP / 2; y < HIGH; y += STEP) {
    for (let x = STEP / 2; x < flag.wide; x += STEP) {
      const part = partAt(flag, x, y);
      if (!part) {
        gaps.push([x, y]);
        continue;
      }
      shown.set(part, shown.get(part) + 1);
      for (const shape of part.shapes) if (inShape(shape, x, y)) shapesShown.add(shape);
    }
  }
  return { shown, shapesShown, gaps };
}

const surveys = new Map();
const surveyOf = (code) => {
  if (!surveys.has(code)) surveys.set(code, survey(FLAGS[code]));
  return surveys.get(code);
};

const colourAt = (code, x, y) => partAt(FLAGS[code], x, y)?.colour ?? null;
/** The place a share of the way from a star's middle to the reach of its points, at a turn from straight up. */
const outFrom = ({ x, y, r }, turn, share) => [x + Math.sin(turn * (Math.PI / 180)) * r * share, y - Math.cos(turn * (Math.PI / 180)) * r * share];

// For every flag, named places and the colour that must be on top there: the middle of each band and emblem, and
// places just inside and just outside their edges.
const usStripes = Array.from({ length: 13 }, (_, n) => [150, ((n + 0.5) * 100) / 13, n % 2 ? 'white' : 'red']);
const SPOTS = {
  UKR: [[75, 25, 'blue'], [75, 75, 'yellow'], [5, 49, 'blue'], [5, 51, 'yellow']],
  POL: [[80, 25, 'white'], [80, 75, 'red'], [155, 49, 'white'], [155, 51, 'red']],
  DEU: [[80, 15, 'black'], [80, 50, 'red'], [80, 85, 'gold'], [10, 32, 'black'], [10, 35, 'red'], [10, 66, 'red'], [10, 68, 'gold'], [165, 50, 'red']],
  FRA: [[25, 50, 'blue'], [75, 50, 'white'], [125, 50, 'red'], [49, 5, 'blue'], [51, 5, 'white'], [99, 95, 'white'], [101, 95, 'red']],
  ITA: [[25, 50, 'green'], [75, 50, 'white'], [125, 50, 'red'], [49, 5, 'green'], [51, 5, 'white'], [99, 95, 'white'], [101, 95, 'red']],
  IRL: [[33, 50, 'green'], [100, 50, 'white'], [166, 50, 'orange'], [65, 10, 'green'], [68, 10, 'white'], [132, 10, 'white'], [135, 10, 'orange']],
  GEO: [
    // The big cross, 20 wide, to the edges.
    [75, 50, 'red'], [75, 5, 'red'], [75, 95, 'red'], [5, 50, 'red'], [145, 50, 'red'],
    [64, 20, 'white'], [66, 20, 'red'], [84, 20, 'red'], [86, 20, 'white'], [40, 39, 'white'], [40, 41, 'red'], [40, 59, 'red'], [40, 61, 'white'],
    // A small cross in the middle of each quarter, with white between its arms.
    [32.5, 20, 'red'], [117.5, 20, 'red'], [32.5, 80, 'red'], [117.5, 80, 'red'],
    [37.5, 15, 'white'], [122.5, 15, 'white'], [27.5, 85, 'white'], [112.5, 85, 'white'],
    // Its arms reach about 10 from its middle.
    [32.5, 11, 'red'], [32.5, 9.5, 'white'], [41.5, 20, 'red'], [43, 20, 'white'], [117.5, 89, 'red'], [117.5, 90.5, 'white'],
    // Its arms flare: the same distance from an arm's middle line is red near the end and white near the middle.
    [35.7, 10.5, 'red'], [35.7, 16, 'white'],
  ],
  ARM: [[100, 16, 'red'], [100, 50, 'blue'], [100, 84, 'orange'], [10, 32, 'red'], [10, 35, 'blue'], [10, 66, 'blue'], [10, 68, 'orange']],
  AZE: [
    [100, 16, 'blue'], [100, 84, 'green'], [160, 50, 'red'], [30, 50, 'red'],
    // The crescent, open to the fly.
    [81, 50, 'white'], [95, 36, 'white'], [95, 64, 'white'], [95, 34.5, 'red'], [95, 50, 'red'], [100, 40, 'red'], [102, 50, 'red'],
    // The star, with a point straight up and one every eighth of a turn.
    [335 / 3, 50, 'white'], [335 / 3, 43, 'white'], [335 / 3, 41, 'red'], [120.5, 50, 'red'], [114, 44.5, 'red'],
  ],
  SWE: [
    [25, 20, 'blue'], [60, 50, 'yellow'], [60, 5, 'yellow'], [5, 50, 'yellow'], [155, 50, 'yellow'], [49, 20, 'blue'], [51, 20, 'yellow'],
    [69, 20, 'yellow'], [71, 20, 'blue'], [80, 20, 'blue'], [100, 39, 'blue'], [100, 41, 'yellow'], [100, 59, 'yellow'], [100, 61, 'blue'], [120, 80, 'blue'],
  ],
  FIN: [
    [59, 50, 'blue'], [59, 5, 'blue'], [5, 50, 'blue'], [160, 50, 'blue'], [44, 20, 'white'], [47, 20, 'blue'], [72, 20, 'blue'], [74, 20, 'white'],
    [81.8, 20, 'white'], [100, 35, 'white'], [100, 38, 'blue'], [100, 63, 'blue'], [100, 65, 'white'], [20, 20, 'white'], [120, 80, 'white'],
  ],
  NOR: [
    [20, 20, 'red'], [100, 80, 'red'], [50, 50, 'blue'], [50, 5, 'blue'], [5, 50, 'blue'], [135, 50, 'blue'], [36, 20, 'red'], [40, 20, 'white'],
    [45, 20, 'blue'], [60, 20, 'white'], [64, 20, 'red'], [68.75, 20, 'red'], [100, 36, 'red'], [100, 39, 'white'], [100, 45, 'blue'], [100, 61, 'white'], [100, 64, 'red'],
  ],
  AUT: [[75, 15, 'red'], [75, 50, 'white'], [75, 85, 'red'], [10, 32, 'red'], [10, 35, 'white'], [10, 66, 'white'], [10, 68, 'red']],
  CZE: [[5, 50, 'blue'], [74, 50, 'blue'], [77, 49, 'white'], [77, 51, 'red'], [40, 30, 'blue'], [40, 24, 'white'], [40, 70, 'blue'], [40, 76, 'red'], [110, 25, 'white'], [110, 75, 'red']],
  CHE: [
    [50, 50, 'white'], [50, 19.5, 'white'], [50, 18, 'red'], [50, 80.5, 'white'], [50, 82, 'red'], [19.5, 50, 'white'], [18, 50, 'red'], [80.5, 50, 'white'],
    [82, 50, 'red'], [40, 30, 'red'], [41.5, 30, 'white'], [59, 30, 'white'], [60, 30, 'red'], [30, 40, 'red'], [30, 41.5, 'white'], [10, 10, 'red'], [90, 90, 'red'], [70, 30, 'red'],
  ],
  JPN: [[75, 50, 'red'], [75, 21, 'red'], [75, 19, 'white'], [104, 50, 'red'], [106, 50, 'white'], [10, 10, 'white'], [140, 90, 'white']],
  VNM: [[75, 50, 'yellow'], [75, 22, 'yellow'], [75, 19, 'red'], [75, 60, 'yellow'], [75, 63, 'red'], [100.5, 41.7, 'yellow'], [83.8, 37.9, 'red'], [10, 10, 'red'], [140, 90, 'red']],
  THA: [
    [75, 8, 'red'], [75, 25, 'white'], [75, 50, 'blue'], [75, 75, 'white'], [75, 92, 'red'], [10, 16, 'red'], [10, 17.5, 'white'], [10, 32, 'white'],
    [10, 34, 'blue'], [10, 66, 'blue'], [10, 68, 'white'], [10, 83, 'white'], [10, 84, 'red'],
  ],
  NGA: [[33, 50, 'green'], [100, 50, 'white'], [166, 50, 'green'], [65, 10, 'green'], [68, 10, 'white'], [132, 10, 'white'], [135, 10, 'green']],
  GHA: [
    [75, 15, 'red'], [20, 50, 'gold'], [130, 50, 'gold'], [75, 85, 'green'], [60, 40, 'gold'],
    // The star fills the gold band from top to bottom.
    [75, 51.76, 'black'], [75, 35.2, 'black'], [75, 32, 'red'], [75, 62.8, 'gold'], [65.25, 65.18, 'black'], [64, 68, 'green'],
  ],
  BWA: [[75, 20, 'blue'], [75, 36.5, 'blue'], [75, 39.5, 'white'], [75, 42.5, 'black'], [75, 50, 'black'], [75, 57.5, 'black'], [75, 60.5, 'white'], [75, 63.5, 'blue'], [75, 80, 'blue']],
  COL: [[75, 25, 'yellow'], [75, 49, 'yellow'], [75, 51, 'blue'], [75, 74, 'blue'], [75, 76, 'red'], [75, 90, 'red']],
  PER: [[25, 50, 'red'], [75, 50, 'white'], [125, 50, 'red'], [49, 5, 'red'], [51, 5, 'white'], [99, 95, 'white'], [101, 95, 'red']],
  CHL: [
    [25, 25, 'white'], [25, 13.9, 'white'], [25, 11, 'blue'], [25, 32.5, 'blue'], [5, 5, 'blue'], [45, 45, 'blue'], [49, 25, 'blue'], [51, 25, 'white'],
    [100, 25, 'white'], [25, 49, 'blue'], [25, 51, 'red'], [100, 75, 'red'],
  ],
  GRC: [
    [100, 5.56, 'blue'], [100, 16.67, 'white'], [100, 27.78, 'blue'], [100, 38.89, 'white'], [100, 50, 'blue'], [100, 61.11, 'white'], [100, 72.22, 'blue'],
    [100, 83.33, 'white'], [100, 94.44, 'blue'], [10, 61.11, 'white'], [10, 72.22, 'blue'],
    // The canton, five stripes square, and its cross one stripe wide.
    [10, 10, 'blue'], [45, 45, 'blue'], [10, 45, 'blue'], [45, 10, 'blue'], [50, 16.67, 'blue'], [57, 16.67, 'white'], [57, 27.78, 'blue'],
    [27.78, 27.78, 'white'], [27.78, 2, 'white'], [27.78, 54, 'white'], [2, 27.78, 'white'], [54, 27.78, 'white'],
    [21, 10, 'blue'], [23, 10, 'white'], [34.5, 10, 'blue'], [10, 21, 'blue'], [10, 23, 'white'], [10, 34.5, 'blue'],
  ],
  TUR: [
    [10, 10, 'red'], [140, 90, 'red'], [120, 50, 'red'],
    // The crescent: 11.25 thick across its middle, open to the fly.
    [24, 50, 'red'], [26, 50, 'white'], [35, 50, 'white'], [37, 50, 'red'], [50, 50, 'red'], [50, 24, 'red'], [50, 27, 'white'], [50, 73, 'white'],
    // The star, with a point to the hoist.
    [82.08, 50, 'white'], [71, 50, 'white'], [68.5, 50, 'red'], [90, 50, 'red'], [91.18, 43.39, 'white'],
  ],
  BGR: [[80, 15, 'white'], [80, 50, 'green'], [80, 85, 'red'], [10, 32, 'white'], [10, 35, 'green'], [10, 66, 'green'], [10, 68, 'red']],
  CHN: [
    [25, 25, 'yellow'], [25, 11.5, 'yellow'], [25, 8, 'red'], [25, 34, 'red'],
    [50, 10, 'yellow'], [60, 20, 'yellow'], [60, 35, 'yellow'], [50, 45, 'yellow'], [55, 27.5, 'red'], [75, 50, 'red'], [140, 90, 'red'], [5, 95, 'red'],
  ],
  ZAF: [
    [110, 20, 'red'], [110, 80, 'blue'], [140, 50, 'green'],
    // The band to the fly: green 20 wide with white 6.67 above and below.
    [110, 50, 'green'], [110, 41, 'green'], [110, 39, 'white'], [110, 35, 'white'], [110, 32, 'red'], [110, 59, 'green'], [110, 61, 'white'], [110, 68, 'blue'],
    // Along the middle: the black triangle, its yellow edge, and the green where the arms meet.
    [2, 50, 'black'], [15, 50, 'black'], [40, 50, 'black'], [47, 50, 'yellow'], [52, 50, 'yellow'], [60, 50, 'green'],
    [2, 5, 'green'], [2, 14, 'yellow'], [2, 22, 'black'],
    // Across each arm: red or blue, white, green, yellow, black.
    [41.09, 3.36, 'red'], [37.21, 9.18, 'white'], [32.77, 15.84, 'green'], [22.79, 30.82, 'yellow'], [18.91, 36.64, 'black'],
    [41.09, 96.64, 'blue'], [37.21, 90.82, 'white'], [32.77, 84.16, 'green'], [22.79, 69.18, 'yellow'], [18.91, 63.36, 'black'],
  ],
  USA: [
    ...usStripes, [77, 5, 'red'], [10, 58, 'white'], [10, 65, 'red'], [5, 95, 'red'],
    // The canton is 76 long and 7 stripes deep.
    [75, 5, 'blue'], [12.67, 5.385, 'blue'], [74, 52, 'blue'], [75, 53, 'blue'], [75, 54.5, 'white'],
    // The first star of the first two rows, and the last star.
    [6.333, 5.385, 'white'], [12.67, 10.77, 'white'], [69.67, 48.46, 'white'],
  ],
  GBR: [
    [100, 50, 'red'], [100, 5, 'red'], [100, 95, 'red'], [5, 50, 'red'], [195, 50, 'red'], [88, 20, 'white'], [92, 20, 'red'], [112, 20, 'white'],
    [150, 38, 'white'], [150, 42, 'red'], [150, 62, 'white'], [60, 10, 'blue'], [10, 30, 'blue'], [140, 90, 'blue'], [190, 70, 'blue'],
    // Across each diagonal: the broad white on one side of its middle line, and the red then a narrow white on the other.
    // Upper hoist: red below the line.
    [45.37, 9.27, 'blue'], [43.58, 12.84, 'white'], [41.34, 17.32, 'white'], [38.66, 22.68, 'red'], [36.29, 27.42, 'white'], [34.63, 30.73, 'blue'],
    // Upper fly: red above the line.
    [154.63, 9.27, 'blue'], [156.29, 12.58, 'white'], [158.66, 17.32, 'red'], [161.34, 22.68, 'white'], [163.58, 27.16, 'white'],
    // Lower fly: red above the line.
    [165.37, 69.27, 'blue'], [163.71, 72.58, 'white'], [161.34, 77.32, 'red'], [158.66, 82.68, 'white'],
    // Lower hoist: red below the line.
    [38.66, 77.32, 'white'], [41.34, 82.68, 'red'], [43.71, 87.42, 'white'], [45.37, 90.73, 'blue'],
  ],
};

test('all 31 flags are there, each with its names, length, colours and 2 to 10 parts', () => {
  assert.deepEqual(Object.keys(FLAGS).sort(), [...CODES].sort());
  for (const code of CODES) {
    const flag = FLAGS[code];
    assert.equal(typeof flag.name, 'string', code);
    assert.ok(flag.name.length > 2, code);
    assert.match(flag.nameKa, /^[ა-ჿ]+( [ა-ჿ]+)*$/, `${code} has its name in Georgian letters`);
    assert.ok(Math.abs(flag.wide - WIDE[code]) < 1e-9, `${code} is ${WIDE[code]} long, not ${flag.wide}`);
    for (const [name, value] of Object.entries(flag.colours)) {
      assert.match(name, /^[a-z]+$/, `${code} colour ${name}`);
      assert.match(value, /^#[0-9a-f]{6}$/, `${code} ${name}`);
    }
    if (flag.colours.white) assert.equal(flag.colours.white, '#ffffff', code);
    assert.ok(flag.parts.length >= 2 && flag.parts.length <= 10, `${code} has ${flag.parts.length} parts`);
    const ids = flag.parts.map((part) => part.id);
    assert.equal(new Set(ids).size, ids.length, `${code} ids ${ids}`);
    for (const part of flag.parts) {
      assert.match(part.id, /^[a-z]+$/, `${code} ${part.id}`);
      assert.ok(part.colour in flag.colours, `${code} ${part.id} is ${part.colour}`);
      assert.ok(part.shapes.length >= 1, `${code} ${part.id}`);
      for (const shape of part.shapes) assert.ok(SHAPE_TYPES.includes(shape.type), `${code} ${part.id} ${shape.type}`);
    }
    // No colour is left over.
    for (const name of Object.keys(flag.colours)) assert.ok(flag.parts.some((part) => part.colour === name), `${code} uses ${name}`);
  }
  assert.equal(FLAGS.TUR.name, 'Türkiye');
  assert.equal(FLAGS.GEO.nameKa, 'საქართველო');
  assert.equal(FLAGS.DEU.nameKa, 'გერმანია');
  assert.equal(FLAGS.USA.nameKa, 'ამერიკის შეერთებული შტატები');
});

test('every shape lies on its flag, and every outline goes round the same way, so a part is filled with no holes', () => {
  for (const code of CODES) {
    const flag = FLAGS[code];
    for (const part of flag.parts) {
      for (const shape of part.shapes) {
        const box = boxOf(shape);
        const where = `${code} ${part.id}`;
        assert.ok(box.left >= -1e-9 && box.top >= -1e-9 && box.right <= flag.wide + 1e-9 && box.bottom <= HIGH + 1e-9, `${where} ${JSON.stringify(box)}`);
        if (shape.type === 'poly') assert.ok(windingOf(shape.points) > 0, where);
      }
    }
  }
});

test('every place on every flag is in some part', () => {
  for (const code of CODES) {
    const { gaps } = surveyOf(code);
    assert.equal(gaps.length, 0, `${code} has gaps, the first at ${gaps[0]}`);
  }
});

test('every part is on top somewhere, with more than a few squares showing, and so is every one of its shapes', () => {
  for (const code of CODES) {
    const flag = FLAGS[code];
    const { shown, shapesShown } = surveyOf(code);
    for (const part of flag.parts) {
      // 12 middles of half-unit squares are 3 whole squares.
      assert.ok(shown.get(part) >= 12, `${code} ${part.id} shows in ${shown.get(part)} places`);
      part.shapes.forEach((shape, n) => assert.ok(shapesShown.has(shape), `${code} ${part.id} shape ${n} is hidden`));
    }
  }
});

test('the part on top is the last one listed there, and there is none off the flag', () => {
  const japan = FLAGS.JPN;
  assert.equal(partAt(japan, 75, 50), japan.parts[1]);
  assert.equal(partAt(japan, 5, 5), japan.parts[0]);
  for (const code of CODES) {
    const flag = FLAGS[code];
    for (const [x, y] of [[-0.1, 50], [flag.wide, 50], [flag.wide + 1, 50], [50, -0.1], [50, HIGH], [50, HIGH + 1], [NaN, 50]]) {
      assert.equal(partAt(flag, x, y), null, `${code} at ${x}, ${y}`);
    }
    assert.ok(partAt(flag, 0, 0) && partAt(flag, flag.wide - 0.01, HIGH - 0.01), code);
  }
});

test('each flag has the right colour on top at its named places', () => {
  assert.deepEqual(Object.keys(SPOTS).sort(), [...CODES].sort());
  for (const code of CODES) {
    for (const [x, y, colour] of SPOTS[code]) assert.equal(colourAt(code, x, y), colour, `${code} at ${x}, ${y}`);
  }
});

test('China\'s four small stars each have a point aimed at the big star\'s middle', () => {
  const [big, smalls] = [FLAGS.CHN.parts[1].shapes[0], FLAGS.CHN.parts[2].shapes];
  assert.equal(smalls.length, 4);
  for (const small of smalls) {
    const towards = Math.atan2(big.y - small.y, big.x - small.x);
    const aimed = starPoints(small).filter((_, n) => n % 2 === 0).some(([x, y]) => Math.abs(Math.atan2(y - small.y, x - small.x) - towards) < 1e-6);
    assert.ok(aimed, `the star at ${small.x}, ${small.y}`);
    // And none is upright, as they'd be by mistake.
    assert.ok(Math.abs(((small.turn % 72) + 72) % 72) > 1, `the star at ${small.x}, ${small.y} turns ${small.turn}`);
  }
  // The big star is upright, three grid units out from its middle, with a point straight up.
  assert.deepEqual([big.x, big.y, big.r, big.turn], [25, 25, 15, 0]);
});

test('the stars and crescents of Azerbaijan and Türkiye have their numbers of points, and Türkiye\'s star points to the hoist', () => {
  const azerbaijan = FLAGS.AZE.parts.find((part) => part.id === 'star').shapes[0];
  const turkiye = FLAGS.TUR.parts.find((part) => part.id === 'star').shapes[0];
  assert.equal(azerbaijan.points, 8);
  assert.equal(turkiye.points, 5);
  const [first] = starPoints(turkiye);
  assert.ok(Math.abs(first[1] - turkiye.y) < 1e-9 && first[0] < turkiye.x, 'a point straight to the hoist');
  for (const code of ['AZE', 'TUR']) {
    const crescent = FLAGS[code].parts.find((part) => part.id === 'crescent').shapes[0];
    assert.equal(crescent.type, 'crescent', code);
    // Open to the fly, so the cut is further from the hoist than the disc.
    assert.ok(crescent.cut.x > crescent.x && crescent.cut.y === crescent.y, code);
  }
});

test('Georgia\'s four small crosses are alike, in the middle of each quarter, and their arms flare out', () => {
  const crosses = FLAGS.GEO.parts.find((part) => part.id === 'crosses').shapes;
  assert.equal(crosses.length, 4);
  const middles = crosses.map((shape) => {
    const box = boxOf(shape);
    return [(box.left + box.right) / 2, (box.top + box.bottom) / 2, box.right - box.left, box.bottom - box.top];
  });
  const quarters = [[32.5, 20], [117.5, 20], [32.5, 80], [117.5, 80]];
  middles.forEach(([x, y, wide, high], n) => {
    assert.ok(Math.abs(x - quarters[n][0]) < 1e-6 && Math.abs(y - quarters[n][1]) < 1e-6, `cross ${n} at ${x}, ${y}`);
    // About a fifth of the flag's height across, as on the flag's construction.
    assert.ok(Math.abs(wide - 20.46) < 0.05 && Math.abs(high - 20.46) < 0.05, `cross ${n} is ${wide} by ${high}`);
  });
  // How wide an arm is, out along it: narrowest near the middle, widest at the end, and curving between.
  const [cx, cy] = quarters[0];
  const armWidth = (out) => {
    let width = 0;
    for (let off = -6; off <= 6; off += 0.01) if (inShape(crosses[0], cx + off, cy - out)) width += 0.01;
    return width;
  };
  const [near, half, far] = [armWidth(3), armWidth(6.5), armWidth(10)];
  assert.ok(near > 4.9 && near < 5.6 && far > 6.8 && far < 7.1, `the arm is ${near} wide near the middle and ${far} at the end`);
  assert.ok(half - near < far - half, 'the sides curve, flaring more towards the end');
});

test('the United States has 13 stripes, a canton 7 stripes deep and two fifths long, and 50 stars in rows of 6 and 5', () => {
  const usa = FLAGS.USA;
  const part = (id) => usa.parts.find((each) => each.id === id);
  assert.equal(part('stripes').shapes.length, 7);
  const canton = part('canton').shapes[0];
  assert.ok(Math.abs(canton.w - (usa.wide * 2) / 5) < 1e-9 && Math.abs(canton.h - 700 / 13) < 1e-9);
  const stars = part('stars').shapes;
  assert.equal(stars.length, 50);
  const rows = new Map();
  for (const star of stars) rows.set(star.y.toFixed(3), (rows.get(star.y.toFixed(3)) ?? 0) + 1);
  assert.deepEqual([...rows.values()], [6, 5, 6, 5, 6, 5, 6, 5, 6]);
  for (const star of stars) assert.ok(star.points === 5 && Math.abs(star.r * 2 - 6.16) < 1e-9 && star.turn === 0);
});

test('the Union Flag\'s red diagonals are counterchanged, so it looks the same turned upside down but not flipped', () => {
  const uk = FLAGS.GBR;
  const turned = (x, y) => [uk.wide - x, HIGH - y];
  const flipped = (x, y) => [uk.wide - x, y];
  let sameTurned = 0;
  let sameFlipped = 0;
  let count = 0;
  for (let y = 0.25; y < HIGH; y += 0.5) {
    for (let x = 0.25; x < uk.wide; x += 0.5) {
      const here = partAt(uk, x, y).colour;
      if (partAt(uk, ...turned(x, y)).colour === here) sameTurned += 1;
      if (partAt(uk, ...flipped(x, y)).colour === here) sameFlipped += 1;
      count += 1;
    }
  }
  assert.equal(sameTurned, count, 'the same turned upside down');
  assert.ok(sameFlipped < count * 0.97, `flipped, ${count - sameFlipped} places change`);
});

test('a star\'s named places are where its points and dents are', () => {
  // The places in the spot checks above at the tips and dents of stars, worked out again from the star itself.
  const vietnam = FLAGS.VNM.parts[1].shapes[0];
  assert.equal(colourAt('VNM', ...outFrom(vietnam, 72, 0.9)), 'yellow');
  assert.equal(colourAt('VNM', ...outFrom(vietnam, 36, 0.5)), 'red');
  const ghana = FLAGS.GHA.parts[3].shapes[0];
  assert.equal(colourAt('GHA', ...outFrom(ghana, 216, 0.9)), 'black');
  assert.equal(colourAt('GHA', ...outFrom(ghana, 180, 0.6)), 'gold');
  const azerbaijan = FLAGS.AZE.parts[4].shapes[0];
  for (let turn = 0; turn < 360; turn += 45) {
    assert.equal(colourAt('AZE', ...outFrom(azerbaijan, turn, 0.9)), 'white', `point at ${turn}`);
    assert.equal(colourAt('AZE', ...outFrom(azerbaijan, turn + 22.5, 0.7)), 'red', `dent at ${turn + 22.5}`);
  }
});
