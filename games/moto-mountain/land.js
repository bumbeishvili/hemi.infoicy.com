// The mountain a ride goes up: the ground, the road on it, and the trees, rocks and signs beside it, all made
// from where the road goes (road.js). The ground is level with the road beside it and rolls away into hills,
// and where the road doubles back on itself the hillside steps down between its two legs.
//
// Nothing here is allowed to flicker at speed: road markings are long and soft, and the signs in a bend are
// far enough apart to pass fewer than three times a second.
import * as THREE from '../../vendor/three/three.module.js';
import { ROAD } from './ride.js';
import { STEP, nearestTo, placeAt } from './road.js';
import { buildArch, buildChevron, buildCup, buildHut, buildPlank, buildRail, flowerGeometry, peakGeometry, pineGeometry, rockGeometry } from './models.js';
import { toon } from '../../core/body/characters.js';

const CELL = 7; // Metres between one place the ground's height is worked out and the next.
const REACH = 132; // How far from the road there's ground.
const FLAT = [9, 36]; // Level with the road this near it, and fully hilly this far off.
const QUARTER = Math.PI / 2;
// A river: how far over the road its water is at the far side, how deep its bed, and how far back its banks start.
const RIVER = { over: 0.12, deep: 1.6, bank: 7 };

const smooth = (low, high, value) => {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;

/** Numbers from 0 to 1 that are always the same for the same place: the ground must not change between rides. */
function hash(x, z, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296;
}

/** Smooth bumps, from -1 to 1, about size metres across. */
function bumps(x, z, size, seed = 0) {
  const gx = x / size;
  const gz = z / size;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, seed);
  const b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed);
  const d = hash(ix + 1, iz + 1, seed);
  return (mix(mix(a, b, sx), mix(c, d, sx), sz) - 0.5) * 2;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

// How the mountain looks at each height: a meadow at the bottom, pine woods, bare rock, and snow at the top.
export const THEMES = {
  meadow: {
    ground: ['#93d468', '#7fc65a', '#a5dc74'], verge: '#b9d98a', sky: ['#7cc4f2', '#d9f1ff'], fog: '#d9f1ff', hill: 8,
    pines: 5, rocks: 1.5, flowers: 26, pine: '#ffffff',
  },
  forest: {
    ground: ['#6fb65a', '#5fa64f', '#82c267'], verge: '#a9c684', sky: ['#74b9ea', '#d2ecfa'], fog: '#d2ecfa', hill: 10,
    pines: 22, rocks: 3, flowers: 6, pine: '#e6f2e6',
  },
  rocks: {
    ground: ['#a9b596', '#98a58b', '#b9c2a6'], verge: '#c4c9ae', sky: ['#7fbde9', '#dcecf7'], fog: '#dcecf7', hill: 13,
    pines: 4, rocks: 11, flowers: 2, pine: '#dfe9e2',
  },
};
export const themeAt = (level) => (level <= 3 ? THEMES.meadow : level <= 6 ? THEMES.forest : THEMES.rocks);
const SNOW = new THREE.Color('#f4f8fb');
const ROCK = new THREE.Color('#9ea7ad');

/** A picture for the tarmac: grey, with pale edges and one long soft dash down the middle. */
function roadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#66717f';
  ctx.fillRect(0, 0, 256, 512);
  const random = seededRandom(5);
  for (let i = 0; i < 2600; i += 1) {
    ctx.fillStyle = random() > 0.5 ? `rgba(150,160,175,${0.06 + random() * 0.1})` : `rgba(40,50,62,${0.06 + random() * 0.12})`;
    ctx.fillRect(random() * 256, random() * 512, 1 + random() * 2, 1 + random() * 2);
  }
  ctx.fillStyle = 'rgba(240,236,220,0.78)';
  ctx.fillRect(7, 0, 7, 512);
  ctx.fillRect(242, 0, 7, 512);
  ctx.fillStyle = 'rgba(240,236,220,0.42)';
  ctx.fillRect(125, 0, 6, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}
const ROAD_TILE = 14; // Metres of road one copy of the picture covers: a dash 7 metres long, and as long a gap.

/**
 * The ground: a net of points CELL metres apart, each as high as the nearest bit of road and then some, by
 * how far off it is. Returns the mesh and at(x, z), the ground's height anywhere.
 */
function buildGround(shape, plan, theme) {
  let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < shape.count; i += 1) {
    minX = Math.min(minX, shape.xs[i]);
    maxX = Math.max(maxX, shape.xs[i]);
    minZ = Math.min(minZ, shape.zs[i]);
    maxZ = Math.max(maxZ, shape.zs[i]);
  }
  const x0 = Math.floor((minX - REACH) / CELL) * CELL;
  const z0 = Math.floor((minZ - REACH) / CELL) * CELL;
  const nx = Math.ceil((maxX + REACH - x0) / CELL) + 1;
  const nz = Math.ceil((maxZ + REACH - z0) / CELL) + 1;
  const heights = new Float32Array(nx * nz);
  const far = new Float32Array(nx * nz);
  const along = new Float32Array(nx * nz);
  const bridges = plan.things.filter(({ kind }) => kind === 'bridge');
  // Each river, and how high its water is: level with the road where a bike wades out of it.
  const rivers = plan.things.filter(({ kind }) => kind === 'river').map(({ from, to }) => ({ from, to, water: placeAt(shape, to, 0, {}).y + RIVER.over }));

  for (let iz = 0; iz < nz; iz += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const x = x0 + ix * CELL;
      const z = z0 + iz * CELL;
      const found = nearestTo(shape, x, z, REACH + CELL * 2);
      const index = iz * nx + ix;
      if (!found) {
        far[index] = Infinity;
        continue;
      }
      const d = found.distance;
      far[index] = d;
      along[index] = found.s;
      const hilly = smooth(FLAT[0], FLAT[1], d);
      // A little under the road where the road is, so the tarmac is never poked through.
      let y = found.y - 0.12 - 0.25 * smooth(5, FLAT[0], d);
      y += (bumps(x, z, 46, 3) * theme.hill + bumps(x, z, 17, 9) * theme.hill * 0.28) * hilly;
      // The ground rises at its far edge, so the picture ends in hills and not in an edge.
      y += smooth(70, REACH, d) * 12;
      // A stream runs under each bridge, in a dip that crosses the road.
      for (const { from, to } of bridges) {
        const into = Math.min(found.s - (from + 2), to - 2 - found.s);
        if (into > 0) y -= 3.4 * smooth(0, 7, into);
      }
      heights[index] = y;
    }
  }
  // Where the road doubles back, the nearest bit of road changes all at once, and the ground with it. A few
  // rounds of evening out, away from the road, turn the step into a slope.
  for (let round = 0; round < 4; round += 1) {
    const before = heights.slice();
    for (let iz = 1; iz < nz - 1; iz += 1) {
      for (let ix = 1; ix < nx - 1; ix += 1) {
        const index = iz * nx + ix;
        if (!(far[index] < Infinity)) continue;
        const around = [index - 1, index + 1, index - nx, index + nx].filter((other) => far[other] < Infinity);
        if (around.length < 4) continue;
        const mean = around.reduce((sum, other) => sum + before[other], 0) / 4;
        heights[index] = mix(before[index], mean, 0.6 * smooth(13, 30, far[index]));
      }
    }
  }

  // A river runs in a bed that crosses the road, under its water, out to where the hillside begins. It's dug
  // after the evening out, which would fill it in again.
  for (const { from, to, water } of rivers) {
    for (let index = 0; index < heights.length; index += 1) {
      if (!(far[index] < Infinity)) continue;
      const into = Math.min(along[index] - from, to - along[index]);
      if (into <= -RIVER.bank) continue;
      const bed = water - RIVER.deep;
      // Beside the water the ground comes down to it, and under it the bed is well below. The near bank, which
      // the road climbs to fly from, keeps the ground under the road and beside it: only further out does it
      // come down.
      const beside = into >= 0 ? 1 : smooth(ROAD.half + ROAD.verge, ROAD.half + ROAD.verge + 8, far[index]);
      heights[index] = mix(heights[index], Math.min(heights[index], bed), smooth(-RIVER.bank, 1, into) * beside);
    }
  }

  const positions = [];
  const colours = [];
  const indices = [];
  const numbers = new Int32Array(nx * nz).fill(-1);
  const tints = theme.ground.map((colour) => new THREE.Color(colour));
  const colour = new THREE.Color();
  for (let iz = 0; iz < nz; iz += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const index = iz * nx + ix;
      if (!(far[index] < Infinity)) continue;
      const x = x0 + ix * CELL;
      const z = z0 + iz * CELL;
      numbers[index] = positions.length / 3;
      positions.push(x, heights[index], z);
      const patch = bumps(x, z, 31, 21);
      colour.copy(tints[0]).lerp(patch > 0 ? tints[2] : tints[1], Math.abs(patch));
      if (theme === THEMES.rocks) colour.lerp(ROCK, smooth(0.1, 0.7, bumps(x, z, 24, 40)) * 0.8);
      if (plan.snowFrom !== null) colour.lerp(SNOW, smooth(plan.snowFrom - 70, plan.snowFrom + 10, along[index]) * 0.96);
      colours.push(colour.r, colour.g, colour.b);
    }
  }
  for (let iz = 0; iz < nz - 1; iz += 1) {
    for (let ix = 0; ix < nx - 1; ix += 1) {
      const a = numbers[iz * nx + ix];
      const b = numbers[iz * nx + ix + 1];
      const c = numbers[(iz + 1) * nx + ix];
      const d = numbers[(iz + 1) * nx + ix + 1];
      if (a < 0 || b < 0 || c < 0 || d < 0) continue;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.receiveShadow = true;

  /** The ground's height at a place, from the four points round it. */
  const at = (x, z) => {
    const gx = Math.min(nx - 1.001, Math.max(0, (x - x0) / CELL));
    const gz = Math.min(nz - 1.001, Math.max(0, (z - z0) / CELL));
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const h = (i, j) => heights[j * nx + i];
    return mix(mix(h(ix, iz), h(ix + 1, iz), fx), mix(h(ix, iz + 1), h(ix + 1, iz + 1), fx), fz);
  };
  return { mesh, at };
}

/** A strip laid along the road between two distances from its middle, each a function of the place. */
function ribbon(shape, { from = shape.from, to = shape.to, inner, outer, lift = () => 0, colourAt = null, uv = false }) {
  const positions = [];
  const colours = [];
  const uvs = [];
  const indices = [];
  const place = {};
  const first = Math.max(0, Math.floor((from - shape.from) / STEP));
  const last = Math.min(shape.count - 1, Math.ceil((to - shape.from) / STEP));
  const colour = new THREE.Color();
  for (let i = first; i <= last; i += 1) {
    const s = shape.from + i * STEP;
    for (const [across, edge] of [[inner(s), 0], [outer(s), 1]]) {
      placeAt(shape, s, across, place);
      positions.push(place.x, place.y + lift(s, edge), place.z);
      if (colourAt) {
        const alpha = colourAt(s, edge, colour);
        colours.push(colour.r, colour.g, colour.b, alpha ?? 1);
      }
      if (uv) uvs.push(edge, s / ROAD_TILE);
    }
    if (i > first) {
      const n = (i - first) * 2;
      // Which way round depends on which side of the road it's on, so that it always faces up.
      if (outer(s) > inner(s)) indices.push(n - 2, n - 1, n, n - 1, n + 1, n);
      else indices.push(n - 2, n, n - 1, n - 1, n, n + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colourAt) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 4));
  if (uv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Everything that stands still on the mountain, for one ride: the ground, the road, its edges, the snow at
 * the top, trees, rocks, flowers, the signs in each bend, the bridges, the start, the finish and the hut.
 * ride is asked how wide the road is at each place. Returns the group to draw, and ground(x, z).
 */
export function buildLand(shape, plan, ride) {
  const level = plan.rules.level;
  const theme = themeAt(level);
  const group = new THREE.Group();
  const half = (s) => ride.halfAt(s);
  const narrow = (s) => ride.narrowAt(s);
  const snowAt = (s) => (plan.snowFrom === null ? 0 : smooth(plan.snowFrom - 50, plan.snowFrom, s));

  const ground = buildGround(shape, plan, theme);
  group.add(ground.mesh);

  // The tarmac, a little above the ground.
  const tarmac = new THREE.Mesh(
    ribbon(shape, { inner: (s) => -half(s), outer: (s) => half(s), lift: () => 0.06, uv: true }),
    new THREE.MeshLambertMaterial({ map: roadTexture() }),
  );
  tarmac.receiveShadow = true;
  group.add(tarmac);

  // The grass beside it that the bike can ride on, which falls away a little at its far edge.
  const vergeColour = new THREE.Color(theme.verge);
  const edge = (s) => half(s) + (ROAD.verge + 1.8) * (1 - narrow(s));
  for (const sign of [-1, 1]) {
    const verge = new THREE.Mesh(
      ribbon(shape, {
        inner: (s) => sign * half(s),
        outer: (s) => sign * edge(s),
        lift: (s, far) => 0.05 - far * 0.42,
        colourAt: (s, far, out) => {
          out.copy(vergeColour).lerp(SNOW, snowAt(s) * 0.95);
          return 1;
        },
      }),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    verge.receiveShadow = true;
    group.add(verge);
  }
  // Snow lying on the road at the top, coming on little by little.
  if (plan.snowFrom !== null) {
    const snow = new THREE.Mesh(
      ribbon(shape, {
        from: plan.snowFrom - 50,
        inner: (s) => -half(s),
        outer: (s) => half(s),
        lift: () => 0.08,
        colourAt: (s, far, out) => {
          out.set('#eef4f8');
          // Thin enough for the tarmac to show through, so the road is still easy to tell from the snow beside it.
          return snowAt(s) * 0.6;
        },
      }),
      new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
    );
    snow.receiveShadow = true;
    group.add(snow);
  }

  addScenery(group, shape, plan, theme, ground.at);
  addSigns(group, shape, plan);
  addBridges(group, shape, plan);

  // The start and the finish, over the road, and the hut at the top with room to pull up beside it.
  const arch = (s, finish) => {
    const built = buildArch((ROAD.half + ROAD.verge) * 2, finish);
    const at = placeAt(shape, s, 0);
    built.position.set(at.x, at.y, at.z);
    built.rotation.y = Math.PI - at.heading;
    group.add(built);
  };
  arch(14, false);
  arch(plan.length, true);
  const hutAt = placeAt(shape, plan.length + 64, -13);
  const hut = buildHut();
  hut.position.set(hutAt.x, ground.at(hutAt.x, hutAt.z), hutAt.z);
  hut.rotation.y = QUARTER - hutAt.heading;
  group.add(hut);
  let cup = null;
  if (plan.rules.cup) {
    cup = buildCup();
    const cupAt = placeAt(shape, plan.length + 50, -4.4);
    cup.position.set(cupAt.x, ground.at(cupAt.x, cupAt.z), cupAt.z);
    cup.rotation.y = -cupAt.heading;
    group.add(cup);
  }
  return { group, ground: ground.at, theme, cup };
}

/** Trees, rocks and flowers, copied all along the road, the same every time for the same road. */
function addScenery(group, shape, plan, theme, groundAt) {
  const random = seededRandom(Math.round(plan.length * 7) + plan.rules.level);
  const length = shape.to - shape.from;
  const place = {};
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  const scatter = (geometry, per100, { near, far, size, sink = 0, colours = null, snowy = false }) => {
    const count = Math.round((length / 100) * per100);
    if (!count) return;
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() }), count);
    let made = 0;
    for (let n = 0; n < count * 3 && made < count; n += 1) {
      const s = shape.from + random() * length;
      // More of them near the road than far from it.
      const off = near + (far - near) * random() ** 1.7;
      placeAt(shape, s, (random() < 0.5 ? -1 : 1) * off, place);
      const found = nearestTo(shape, place.x, place.z, off + 4);
      // Not where another stretch of the road is nearer, as inside a bend that doubles back.
      if (!found || found.distance < off * 0.8 || found.distance < near) continue;
      const scale = size[0] + (size[1] - size[0]) * random();
      quaternion.setFromAxisAngle(up, random() * Math.PI * 2);
      matrix.compose(new THREE.Vector3(place.x, groundAt(place.x, place.z) - sink * scale, place.z), quaternion, new THREE.Vector3(scale, scale * (0.85 + random() * 0.3), scale));
      mesh.setMatrixAt(made, matrix);
      if (colours) tint.set(colours[Math.floor(random() * colours.length)]);
      else tint.set('#ffffff');
      if (snowy && plan.snowFrom !== null) tint.lerp(SNOW, smooth(plan.snowFrom - 60, plan.snowFrom, found.s) * 0.75);
      mesh.setColorAt(made, tint);
      made += 1;
    }
    mesh.count = made;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  };
  const clear = ROAD.half + ROAD.verge + 3.2;
  scatter(pineGeometry(), theme.pines, { near: clear + 1.5, far: 96, size: [0.9, 1.9], sink: 0.1, snowy: true });
  scatter(rockGeometry(), theme.rocks, { near: clear, far: 80, size: [0.6, 2.2], sink: 0.12, snowy: true });
  scatter(flowerGeometry(), theme.flowers, { near: clear - 1.6, far: 20, size: [0.8, 1.5], colours: ['#ffffff', '#ffd23f', '#ff8fb1', '#c9a7ff'] });

  // Far-off mountains all round, which the fog doesn't hide.
  const peaks = new THREE.InstancedMesh(peakGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }), 16);
  const middle = placeAt(shape, plan.length / 2, 0);
  for (let n = 0; n < 16; n += 1) {
    const angle = (n / 16) * Math.PI * 2 + random() * 0.2;
    const away = 1500 + random() * 500;
    const height = 260 + random() * 330;
    matrix.compose(new THREE.Vector3(middle.x + Math.cos(angle) * away, -40, middle.z + Math.sin(angle) * away), quaternion.identity(), new THREE.Vector3(height * (1.3 + random()), height, height * (1.3 + random())));
    peaks.setMatrixAt(n, matrix);
  }
  peaks.instanceMatrix.needsUpdate = true;
  peaks.frustumCulled = false;
  group.add(peaks);
}

/** Boards with arrows on, round the outside of each bend, pointing the way it goes. */
function addSigns(group, shape, plan) {
  const place = {};
  for (const bend of plan.bends) {
    const from = bend.from + (bend.ramp ?? 16) * 0.35;
    const to = bend.to - (bend.ramp ?? 16) * 0.8;
    const count = Math.max(2, Math.round((to - from) / 26));
    for (let n = 0; n < count; n += 1) {
      const s = from + ((to - from) * n) / (count - 1);
      placeAt(shape, s, -bend.turn * (ROAD.half + ROAD.verge + 2.6), place);
      const board = buildChevron(bend.turn);
      board.position.set(place.x, place.y - 0.4, place.z);
      // Facing back down the road, towards the bike coming.
      board.rotation.y = -place.heading;
      group.add(board);
    }
  }
}

/** Each bridge's planks and railings, and the water under it. */
function addBridges(group, shape, plan) {
  const place = {};
  for (const { from, to } of plan.things.filter(({ kind }) => kind === 'bridge')) {
    const width = ROAD.bridgeHalf * 2 + ROAD.rail * 2;
    for (let s = from + 1; s < to; s += 2) {
      placeAt(shape, s, 0, place);
      const plank = buildPlank(width);
      plank.position.set(place.x, place.y + 0.08, place.z);
      plank.rotation.y = Math.PI - place.heading;
      group.add(plank);
    }
    for (const sign of [-1, 1]) {
      for (let s = from; s < to; s += 4) {
        placeAt(shape, s + 2, sign * (ROAD.bridgeHalf + ROAD.rail + 0.1), place);
        const rail = buildRail(4);
        rail.position.set(place.x, place.y + 0.1, place.z);
        rail.rotation.y = Math.PI - place.heading;
        group.add(rail);
      }
    }
    // The stream, which shows wherever the ground has dipped below it.
    placeAt(shape, (from + to) / 2, 0, place);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(240, to - from + 30).rotateX(-QUARTER), new THREE.MeshLambertMaterial({ color: '#63b4e6' }));
    water.position.set(place.x, place.y - 1.9, place.z);
    water.rotation.y = -place.heading;
    group.add(water);
  }
}
