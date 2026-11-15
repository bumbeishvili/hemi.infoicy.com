// The flags a child colours in on the World Tour, drawn from numbers only. Each flag is 100 high and as wide as its
// official proportions make it, with 0, 0 at the top left, in the shapes of shapes.js. A flag's parts are what the
// child colours in, one at a time. They're listed in the order they're drawn, so a later part lies over an earlier one.
// The sizes and places come from each flag's official construction, and the colours from its published values.
import { inPart } from './shapes.js';

/** How high every flag is, in its own units. */
export const HIGH = 100;

const RAD = Math.PI / 180;
/** The dents of a regular five-pointed star, as a share of the reach of its points. */
const FIVE = Math.cos(72 * RAD) / Math.cos(36 * RAD);

const rect = (x, y, w, h) => ({ type: 'rect', x, y, w, h });
const circle = (x, y, r) => ({ type: 'circle', x, y, r });
const star = (x, y, r, turn = 0) => ({ type: 'star', x, y, r, points: 5, inner: FIVE, turn });
const part = (id, colour, ...shapes) => ({ id, colour, shapes });
/** A band across the flag, from one height down to another. */
const across = (wide, top, bottom) => rect(0, top, wide, bottom - top);
/** A band from top to bottom, from one place along the flag to another. */
const down = (left, right) => rect(left, 0, right - left, HIGH);

/** Twice the area inside some corners: more than 0 when they go round the same way as a rect's. */
export function windingOf(points) {
  let sum = 0;
  for (let n = 0; n < points.length; n += 1) {
    const [ax, ay] = points[n];
    const [bx, by] = points[(n + 1) % points.length];
    sum += ax * by - bx * ay;
  }
  return sum;
}

/**
 * An outline, always going round the same way as a rect, a circle and a star do. A canvas fills a part's shapes as
 * one path, so two shapes of a part that overlap, going round opposite ways, would leave a hole where they overlap.
 */
const poly = (points) => ({ type: 'poly', points: windingOf(points) < 0 ? [...points].reverse() : points });

/** The turn that aims one point of a star at x, y at another place. */
const aimedAt = (x, y, to) => Math.atan2(to.y - y, to.x - x) / RAD + 90;

// Georgia's four small crosses are Bolnisi crosses: crosses pattée, whose arms flare out towards their ends with
// curved sides, and whose ends dip a little. These are the arcs of the flag's construction, in flag units. Each side of
// an arm is part of a circle of radius 52 whose centre is 54.5 to the side of the cross's middle. Each end is part of a
// circle of radius 27 whose centre is 37 out along the arm. The arms are 7.03 wide at their ends and 5 at the middle,
// and reach 10.23 from the middle. shapes.js has only straight sides, so each arc is made of short straight ones.
const BOLNISI = { side: { away: 54.5, r: 52 }, end: { away: 37, r: 27 }, endHalf: 3.516, steps: 8 };

function bolnisiCross(cx, cy) {
  const { side, end, endHalf, steps } = BOLNISI;
  // How far an arm's side is from the arm's middle line, at a distance out from the cross's middle.
  const sideAt = (out) => side.away - Math.sqrt(side.r ** 2 - out ** 2);
  // How far an arm's end is from the cross's middle, at a distance from the arm's middle line.
  const endAt = (off) => end.away - Math.sqrt(end.r ** 2 - off ** 2);
  // Where the sides of two arms meet, on the diagonal between them.
  const meet = (side.away - Math.sqrt(2 * side.r ** 2 - side.away ** 2)) / 2;
  const reach = endAt(endHalf);
  const corner = sideAt(reach);
  // The arm that points up, going round: up its left side, along its end, and down its right side.
  const arm = [];
  for (let n = 0; n <= steps; n += 1) {
    const out = meet + ((reach - meet) * n) / steps;
    arm.push([-sideAt(out), -out]);
  }
  for (let n = 1; n < steps; n += 1) {
    const off = -corner + (2 * corner * n) / steps;
    arm.push([off, -endAt(off)]);
  }
  for (let n = steps; n >= 0; n -= 1) {
    const out = meet + ((reach - meet) * n) / steps;
    arm.push([sideAt(out), -out]);
  }
  // The other three arms are the same arm turned a quarter round each time. Each arm ends where the next begins.
  const points = [];
  for (let turn = 0; turn < 4; turn += 1) {
    for (const [x0, y0] of arm.slice(0, -1)) {
      let [x, y] = [x0, y0];
      for (let n = 0; n < turn; n += 1) [x, y] = [-y, x];
      points.push([cx + x, cy + y]);
    }
  }
  return poly(points);
}

// South Africa's Y: green arms along lines from the two hoist corners to the middle of the flag, and on from there to
// the fly, with white or yellow borders. Its outline at a distance from those lines, and the hoist triangle inside it.
const SA = { wide: 150, sin: 50 / Math.hypot(75, 50), cos: 75 / Math.hypot(75, 50) };

function southAfricaY(d) {
  const { wide, sin, cos } = SA;
  const top = d / sin; // where the arm's outer edge meets the top of the flag
  const bend = ((50 - d) * cos + d) / sin; // where the arm's outer edge meets the band to the fly
  const tip = 75 - d / sin; // the point of the triangle inside the Y
  const side = d / cos; // where the arm's inner edge meets the hoist
  return poly([[0, 0], [top, 0], [bend, 50 - d], [wide, 50 - d], [wide, 50 + d], [bend, 50 + d], [top, HIGH], [0, HIGH],
    [0, HIGH - side], [tip, 50], [0, side]]);
}

function southAfricaTriangle(d) {
  return poly([[0, d / SA.cos], [75 - d / SA.sin, 50], [0, HIGH - d / SA.cos]]);
}

// The Union Flag at 1:2, from its construction at 30 high by 60 wide: the white saltire 6 wide, the red saltire 2 wide
// and counterchanged, the white cross 10 wide and the red cross 6. The saltires' edges, as heights from their middle
// lines, which go across the flag 1 down for every 2 along.
const UK = { wide: 200, white: 10 * Math.hypot(1, 0.5), red: (20 / 3) * Math.hypot(1, 0.5) };

function unionFlagWhiteSaltire() {
  const { wide, white: o } = UK;
  return [
    poly([[0, 0], [2 * o, 0], [wide, HIGH - o], [wide, HIGH], [wide - 2 * o, HIGH], [0, o]]),
    poly([[wide, 0], [wide, o], [2 * o, HIGH], [0, HIGH], [0, HIGH - o], [wide - 2 * o, 0]]),
  ];
}

/**
 * St Patrick's red saltire, counterchanged pinwheel fashion: each arm lies to one side of its white arm's middle line,
 * with the broad white on the other side, so the flag looks the same turned half way round but not flipped over.
 */
function unionFlagRedSaltire() {
  const { wide, red: r } = UK;
  const [mx, my] = [wide / 2, HIGH / 2];
  return [
    poly([[0, 0], [mx, my], [mx - 2 * r, my], [0, r]]), // upper hoist: below the line, the broad white above it
    poly([[mx, my], [wide, 0], [wide - 2 * r, 0], [mx, my - r]]), // upper fly: above the line
    poly([[mx, my], [wide, HIGH], [wide, HIGH - r], [mx + 2 * r, my]]), // lower fly: above the line
    poly([[mx, my], [0, HIGH], [2 * r, HIGH], [mx, my + r]]), // lower hoist: below the line
  ];
}

/** The 50 stars of the United States, in nine rows of six and five across the canton. */
function unitedStatesStars() {
  // The canton is cut into 12 along and 10 down, and the stars sit where those lines cross.
  const columnStep = 76 / 12;
  const rowStep = 700 / 13 / 10;
  const stars = [];
  for (let row = 1; row <= 9; row += 1) {
    for (let column = row % 2 ? 1 : 2; column <= 11; column += 2) stars.push(star(column * columnStep, row * rowStep, 3.08));
  }
  return stars;
}

/** The 13 stripes of the United States, seven of them red, from the top. */
const usStripes = (wide) => Array.from({ length: 7 }, (_, n) => across(wide, (2 * n * HIGH) / 13, ((2 * n + 1) * HIGH) / 13));

const CHINA_STAR = { x: 25, y: 25 };

export const FLAGS = {
  UKR: {
    name: 'Ukraine',
    nameKa: 'უკრაინა',
    wide: 150,
    colours: { blue: '#0057b7', yellow: '#ffd700' },
    parts: [part('top', 'blue', across(150, 0, 50)), part('bottom', 'yellow', across(150, 50, 100))],
  },
  POL: {
    name: 'Poland',
    nameKa: 'პოლონეთი',
    wide: 160,
    colours: { white: '#ffffff', red: '#dc143c' },
    parts: [part('top', 'white', across(160, 0, 50)), part('bottom', 'red', across(160, 50, 100))],
  },
  DEU: {
    name: 'Germany',
    nameKa: 'გერმანია',
    wide: 500 / 3,
    colours: { black: '#000000', red: '#dd0000', gold: '#ffce00' },
    parts: [
      part('top', 'black', across(500 / 3, 0, 100 / 3)),
      part('middle', 'red', across(500 / 3, 100 / 3, 200 / 3)),
      part('bottom', 'gold', across(500 / 3, 200 / 3, 100)),
    ],
  },
  FRA: {
    name: 'France',
    nameKa: 'საფრანგეთი',
    wide: 150,
    colours: { blue: '#002654', white: '#ffffff', red: '#ce1126' },
    parts: [part('left', 'blue', down(0, 50)), part('middle', 'white', down(50, 100)), part('right', 'red', down(100, 150))],
  },
  ITA: {
    name: 'Italy',
    nameKa: 'იტალია',
    wide: 150,
    colours: { green: '#009246', white: '#ffffff', red: '#ce2b37' },
    parts: [part('left', 'green', down(0, 50)), part('middle', 'white', down(50, 100)), part('right', 'red', down(100, 150))],
  },
  IRL: {
    name: 'Ireland',
    nameKa: 'ირლანდია',
    wide: 200,
    colours: { green: '#169b62', white: '#ffffff', orange: '#ff883e' },
    parts: [
      part('left', 'green', down(0, 200 / 3)),
      part('middle', 'white', down(200 / 3, 400 / 3)),
      part('right', 'orange', down(400 / 3, 200)),
    ],
  },
  GEO: {
    // The flag's construction is 30 by 20, which is 5 flag units to each of its units.
    name: 'Georgia',
    nameKa: 'საქართველო',
    wide: 150,
    colours: { white: '#ffffff', red: '#ff0000' },
    parts: [
      part('field', 'white', rect(0, 0, 150, 100)),
      part('cross', 'red', rect(65, 0, 20, 100), rect(0, 40, 150, 20)),
      part('crosses', 'red', bolnisiCross(32.5, 20), bolnisiCross(117.5, 20), bolnisiCross(32.5, 80), bolnisiCross(117.5, 80)),
    ],
  },
  ARM: {
    name: 'Armenia',
    nameKa: 'სომხეთი',
    wide: 200,
    colours: { red: '#d90012', blue: '#0033a0', orange: '#f2a800' },
    parts: [
      part('top', 'red', across(200, 0, 100 / 3)),
      part('middle', 'blue', across(200, 100 / 3, 200 / 3)),
      part('bottom', 'orange', across(200, 200 / 3, 100)),
    ],
  },
  AZE: {
    // The crescent and the eight-pointed star are in the middle of the red band, the star towards the fly.
    name: 'Azerbaijan',
    nameKa: 'აზერბაიჯანი',
    wide: 200,
    colours: { blue: '#00b5e2', red: '#ef3340', green: '#509e2f', white: '#ffffff' },
    parts: [
      part('top', 'blue', across(200, 0, 100 / 3)),
      part('middle', 'red', across(200, 100 / 3, 200 / 3)),
      part('bottom', 'green', across(200, 200 / 3, 100)),
      part('crescent', 'white', { type: 'crescent', x: 95, y: 50, r: 15, cut: { x: 95 + 10 / 3, y: 50, r: 12.5 } }),
      part('star', 'white', { type: 'star', x: 335 / 3, y: 50, r: 25 / 3, points: 8, inner: 0.5, turn: 0 }),
    ],
  },
  SWE: {
    // 5:2:9 along and 4:2:4 down.
    name: 'Sweden',
    nameKa: 'შვედეთი',
    wide: 160,
    colours: { blue: '#005293', yellow: '#fecb00' },
    parts: [part('field', 'blue', rect(0, 0, 160, 100)), part('cross', 'yellow', rect(50, 0, 20, 100), rect(0, 40, 160, 20))],
  },
  FIN: {
    // 5:3:10 along and 4:3:4 down.
    name: 'Finland',
    nameKa: 'ფინეთი',
    wide: 1800 / 11,
    colours: { white: '#ffffff', blue: '#002f6c' },
    parts: [
      part('field', 'white', rect(0, 0, 1800 / 11, 100)),
      part('cross', 'blue', rect(500 / 11, 0, 300 / 11, 100), rect(0, 400 / 11, 1800 / 11, 300 / 11)),
    ],
  },
  NOR: {
    // 6:1:2:1:12 along and 6:1:2:1:6 down, in units of 6.25.
    name: 'Norway',
    nameKa: 'ნორვეგია',
    wide: 137.5,
    colours: { red: '#ba0c2f', white: '#ffffff', blue: '#00205b' },
    parts: [
      part('field', 'red', rect(0, 0, 137.5, 100)),
      part('border', 'white', rect(37.5, 0, 25, 100), rect(0, 37.5, 137.5, 25)),
      part('cross', 'blue', rect(43.75, 0, 12.5, 100), rect(0, 43.75, 137.5, 12.5)),
    ],
  },
  AUT: {
    name: 'Austria',
    nameKa: 'ავსტრია',
    wide: 150,
    colours: { red: '#c8102e', white: '#ffffff' },
    parts: [part('stripes', 'red', across(150, 0, 100 / 3), across(150, 200 / 3, 100)), part('middle', 'white', across(150, 100 / 3, 200 / 3))],
  },
  CZE: {
    // The blue triangle reaches half way along.
    name: 'Czechia',
    nameKa: 'ჩეხეთი',
    wide: 150,
    colours: { white: '#ffffff', red: '#d7141a', blue: '#11457e' },
    parts: [
      part('top', 'white', across(150, 0, 50)),
      part('bottom', 'red', across(150, 50, 100)),
      part('triangle', 'blue', poly([[0, 0], [75, 50], [0, 100]])),
    ],
  },
  CHE: {
    // Square, on 32 units: the cross's arms are 6 units wide and 7 long, one sixth longer than they're wide.
    name: 'Switzerland',
    nameKa: 'შვეიცარია',
    wide: 100,
    colours: { red: '#ff0000', white: '#ffffff' },
    parts: [part('field', 'red', rect(0, 0, 100, 100)), part('cross', 'white', rect(40.625, 18.75, 18.75, 62.5), rect(18.75, 40.625, 62.5, 18.75))],
  },
  JPN: {
    // The disc is three fifths of the height across, in the middle.
    name: 'Japan',
    nameKa: 'იაპონია',
    wide: 150,
    colours: { white: '#ffffff', red: '#bc002d' },
    parts: [part('field', 'white', rect(0, 0, 150, 100)), part('sun', 'red', circle(75, 50, 30))],
  },
  VNM: {
    // The star's points reach a fifth of the flag's length from its middle.
    name: 'Vietnam',
    nameKa: 'ვიეტნამი',
    wide: 150,
    colours: { red: '#da251d', yellow: '#ffff00' },
    parts: [part('field', 'red', rect(0, 0, 150, 100)), part('star', 'yellow', star(75, 50, 30))],
  },
  THA: {
    // 1:1:2:1:1 down.
    name: 'Thailand',
    nameKa: 'ტაილანდი',
    wide: 150,
    colours: { red: '#a51931', white: '#ffffff', blue: '#2d2a4a' },
    parts: [
      part('outside', 'red', across(150, 0, 100 / 6), across(150, 500 / 6, 100)),
      part('inside', 'white', across(150, 100 / 6, 100 / 3), across(150, 200 / 3, 500 / 6)),
      part('middle', 'blue', across(150, 100 / 3, 200 / 3)),
    ],
  },
  NGA: {
    name: 'Nigeria',
    nameKa: 'ნიგერია',
    wide: 200,
    colours: { green: '#008751', white: '#ffffff' },
    parts: [part('sides', 'green', down(0, 200 / 3), down(400 / 3, 200)), part('middle', 'white', down(200 / 3, 400 / 3))],
  },
  GHA: {
    // The black star is as tall as the gold band: its top point touches the red and its two lower points the green.
    name: 'Ghana',
    nameKa: 'განა',
    wide: 150,
    colours: { red: '#ce1126', gold: '#fcd116', green: '#006b3f', black: '#000000' },
    parts: [
      part('top', 'red', across(150, 0, 100 / 3)),
      part('middle', 'gold', across(150, 100 / 3, 200 / 3)),
      part('bottom', 'green', across(150, 200 / 3, 100)),
      part('star', 'black', star(75, 100 / 3 + 100 / 3 / (1 + Math.cos(36 * RAD)), 100 / 3 / (1 + Math.cos(36 * RAD)))),
    ],
  },
  BWA: {
    // 9:1:4:1:9 down.
    name: 'Botswana',
    nameKa: 'ბოტსვანა',
    wide: 150,
    colours: { blue: '#6da9d2', white: '#ffffff', black: '#000000' },
    parts: [
      part('field', 'blue', rect(0, 0, 150, 100)),
      part('border', 'white', across(150, 37.5, 62.5)),
      part('band', 'black', across(150, 125 / 3, 175 / 3)),
    ],
  },
  COL: {
    // The yellow is half the height, the blue and the red a quarter each.
    name: 'Colombia',
    nameKa: 'კოლუმბია',
    wide: 150,
    colours: { yellow: '#ffcd00', blue: '#003087', red: '#c8102e' },
    parts: [
      part('top', 'yellow', across(150, 0, 50)),
      part('middle', 'blue', across(150, 50, 75)),
      part('bottom', 'red', across(150, 75, 100)),
    ],
  },
  PER: {
    // The plain civil flag, with no coat of arms.
    name: 'Peru',
    nameKa: 'პერუ',
    wide: 150,
    colours: { red: '#d91023', white: '#ffffff' },
    parts: [part('sides', 'red', down(0, 50), down(100, 150)), part('middle', 'white', down(50, 100))],
  },
  CHL: {
    // The blue canton is a square half the height, and the circle round the star's points is half the canton across.
    name: 'Chile',
    nameKa: 'ჩილე',
    wide: 150,
    colours: { white: '#ffffff', blue: '#0032a0', red: '#da291c' },
    parts: [
      part('top', 'white', across(150, 0, 50)),
      part('bottom', 'red', across(150, 50, 100)),
      part('canton', 'blue', rect(0, 0, 50, 50)),
      part('star', 'white', star(25, 25, 12.5)),
    ],
  },
  GRC: {
    // Nine stripes, and a canton five stripes square with a cross one stripe wide.
    name: 'Greece',
    nameKa: 'საბერძნეთი',
    wide: 150,
    colours: { white: '#ffffff', blue: '#0d5eaf' },
    parts: [
      part('field', 'white', rect(0, 0, 150, 100)),
      part('stripes', 'blue', ...[0, 2, 4, 6, 8].map((n) => across(150, (n * 100) / 9, ((n + 1) * 100) / 9))),
      part('canton', 'blue', rect(0, 0, 500 / 9, 500 / 9)),
      part('cross', 'white', rect(200 / 9, 0, 100 / 9, 500 / 9), rect(0, 200 / 9, 500 / 9, 100 / 9)),
    ],
  },
  TUR: {
    // From the flag law, with the height as G: the crescent's outer circle is G/2 across with its centre G/2 from the
    // hoist, and its inner circle 2G/5 across with its centre G/16 further on. The circle round the star's points is
    // G/4 across and begins G/3 on from where the inner circle begins, and the star has one point to the hoist. The
    // white sleeve at the hoist is left out, as it usually is.
    name: 'Türkiye',
    nameKa: 'თურქეთი',
    wide: 150,
    colours: { red: '#e30a17', white: '#ffffff' },
    parts: [
      part('field', 'red', rect(0, 0, 150, 100)),
      part('crescent', 'white', { type: 'crescent', x: 50, y: 50, r: 25, cut: { x: 56.25, y: 50, r: 20 } }),
      part('star', 'white', star(56.25 - 20 + 100 / 3 + 12.5, 50, 12.5, -90)),
    ],
  },
  BGR: {
    name: 'Bulgaria',
    nameKa: 'ბულგარეთი',
    wide: 500 / 3,
    colours: { white: '#ffffff', green: '#00966e', red: '#d62612' },
    parts: [
      part('top', 'white', across(500 / 3, 0, 100 / 3)),
      part('middle', 'green', across(500 / 3, 100 / 3, 200 / 3)),
      part('bottom', 'red', across(500 / 3, 200 / 3, 100)),
    ],
  },
  CHN: {
    // On a grid of 5 flag units: the big star 3 units out from its middle at 5, 5, and the small ones 1 unit out at
    // 10, 2; 12, 4; 12, 7 and 10, 9, each with a point aimed at the big star's middle.
    name: 'China',
    nameKa: 'ჩინეთი',
    wide: 150,
    colours: { red: '#ee1c25', yellow: '#ffff00' },
    parts: [
      part('field', 'red', rect(0, 0, 150, 100)),
      part('star', 'yellow', star(CHINA_STAR.x, CHINA_STAR.y, 15)),
      part('stars', 'yellow', ...[[50, 10], [60, 20], [60, 35], [50, 45]].map(([x, y]) => star(x, y, 5, aimedAt(x, y, CHINA_STAR)))),
    ],
  },
  ZAF: {
    // The Y's green is a fifth of the height wide, and its white and yellow borders a fifteenth each. Its arms come from
    // the hoist's corners and meet in the middle of the flag.
    name: 'South Africa',
    nameKa: 'სამხრეთ აფრიკა',
    wide: 150,
    colours: { red: '#e03c31', blue: '#001489', white: '#ffffff', green: '#007749', yellow: '#ffb81c', black: '#000000' },
    parts: [
      part('top', 'red', across(150, 0, 50)),
      part('bottom', 'blue', across(150, 50, 100)),
      part('border', 'white', southAfricaY(50 / 3)),
      part('band', 'green', southAfricaY(10)),
      part('edge', 'yellow', southAfricaTriangle(10)),
      part('triangle', 'black', southAfricaTriangle(50 / 3)),
    ],
  },
  USA: {
    // 10:19, with 13 stripes. The canton is 7 stripes deep and two fifths of the length, and the stars 0.0616 of the
    // height across.
    name: 'United States',
    nameKa: 'ამერიკის შეერთებული შტატები',
    wide: 190,
    colours: { white: '#ffffff', red: '#b31942', blue: '#0a3161' },
    parts: [
      part('field', 'white', rect(0, 0, 190, 100)),
      part('stripes', 'red', ...usStripes(190)),
      part('canton', 'blue', rect(0, 0, 76, 700 / 13)),
      part('stars', 'white', ...unitedStatesStars()),
    ],
  },
  GBR: {
    name: 'United Kingdom',
    nameKa: 'გაერთიანებული სამეფო',
    wide: 200,
    colours: { blue: '#012169', white: '#ffffff', red: '#c8102e' },
    parts: [
      part('field', 'blue', rect(0, 0, 200, 100)),
      part('saltire', 'white', ...unionFlagWhiteSaltire()),
      part('diagonals', 'red', ...unionFlagRedSaltire()),
      part('border', 'white', rect(250 / 3, 0, 100 / 3, 100), rect(0, 100 / 3, 200, 100 / 3)),
      part('cross', 'red', rect(90, 0, 20, 100), rect(0, 40, 200, 20)),
    ],
  },
};

/** The part on top at a place on a flag, or null off the flag. */
export function partAt(flag, x, y) {
  if (!(x >= 0 && x < flag.wide && y >= 0 && y < HIGH)) return null;
  for (let n = flag.parts.length - 1; n >= 0; n -= 1) if (inPart(flag.parts[n], x, y)) return flag.parts[n];
  return null;
}
