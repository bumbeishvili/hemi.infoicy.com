// The globe that Giraffe's World Tour flies round: the countries of the world, seen as a ball from far away,
// turned to face any place and brought nearer. The map is world.json, made by tools/make_world_map.py from Natural
// Earth's countries, with borders as the United Nations recognises them.
//
// The sums are here with no screen, so the unit tests can ask where a place is: project() says where a longitude
// and latitude land on a globe of radius 1 with its middle at 0, 0, and whether that's on the side that's seen.
// draw() puts it on a canvas.
const RAD = Math.PI / 180;

/** A place on the Earth as a direction from its middle. */
const direction = (lon, lat) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];

/** How far apart two places are, in degrees round the Earth. */
export function apart(a, b) {
  const [p, q] = [direction(a[0], a[1]), direction(b[0], b[1])];
  return Math.acos(Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]))) / RAD;
}

/** A place a share of the way from one place to another, by the shortest way round. */
export function between(a, b, share) {
  const [p, q] = [direction(a[0], a[1]), direction(b[0], b[1])];
  const angle = Math.acos(Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2])));
  if (angle < 1e-6) return [a[0], a[1]];
  const [f, g] = [Math.sin((1 - share) * angle) / Math.sin(angle), Math.sin(share * angle) / Math.sin(angle)];
  const [x, y, z] = [p[0] * f + q[0] * g, p[1] * f + q[1] * g, p[2] * f + q[2] * g];
  return [Math.atan2(y, x) / RAD, Math.asin(Math.max(-1, Math.min(1, z))) / RAD];
}

export class Globe {
  /** countries is world.json's list: { id, name, at: [lon, lat], rings: [[lon, lat, lon, lat, ...], ...] }. */
  constructor(countries) {
    this.countries = countries.map((country) => ({
      id: country.id,
      name: country.name,
      at: country.at,
      // Each outline as directions from the middle of the Earth, three numbers to a point, ready to be turned.
      rings: country.rings.map((ring) => {
        const out = new Float32Array((ring.length / 2) * 3);
        for (let n = 0; n < ring.length / 2; n += 1) out.set(direction(ring[n * 2], ring[n * 2 + 1]), n * 3);
        return out;
      }),
    }));
    this.byId = new Map(this.countries.map((country) => [country.id, country]));
    this.lon = 0;
    this.lat = 0;
    this.turned();
  }

  /** Turns the globe so that this place faces the viewer. */
  face(lon, lat) {
    this.lon = lon;
    this.lat = lat;
    this.turned();
  }

  turned() {
    const [l, p] = [this.lon * RAD, this.lat * RAD];
    // Which way is east, north and towards the viewer, at the place that faces them.
    this.east = [-Math.sin(l), Math.cos(l), 0];
    this.north = [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)];
    this.out = [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
  }

  /**
   * Where a place is on a globe of radius 1 with its middle at 0, 0: x to the right and y down, as on a screen.
   * front says whether it's on the side that's seen, and depth how far towards the viewer, from -1 to 1.
   */
  project(lon, lat) {
    const [x, y, z] = direction(lon, lat);
    const depth = x * this.out[0] + y * this.out[1] + z * this.out[2];
    return {
      x: x * this.east[0] + y * this.east[1] + z * this.east[2],
      y: -(x * this.north[0] + y * this.north[1] + z * this.north[2]),
      depth,
      front: depth > 0,
    };
  }

  /** Where a country's name goes, on that globe: see project. */
  where(id) {
    const country = this.byId.get(id);
    return country ? this.project(country.at[0], country.at[1]) : null;
  }

  /** Adds a country's outlines to the path being drawn. Returns whether any of it is on the side that's seen. */
  trace(ctx, country, cx, cy, radius) {
    const { east, north, out } = this;
    let seen = false;
    for (const ring of country.rings) {
      // Is any of this outline on the near side? One that's all round the back isn't drawn.
      let near = false;
      for (let n = 0; n < ring.length; n += 3) {
        if (ring[n] * out[0] + ring[n + 1] * out[1] + ring[n + 2] * out[2] > 0) {
          near = true;
          break;
        }
      }
      if (!near) continue;
      seen = true;
      for (let n = 0; n < ring.length; n += 3) {
        const [vx, vy, vz] = [ring[n], ring[n + 1], ring[n + 2]];
        let x = vx * east[0] + vy * east[1] + vz * east[2];
        let y = vx * north[0] + vy * north[1] + vz * north[2];
        // A point round the back is brought to the edge of the ball, so the outline runs along the edge.
        if (vx * out[0] + vy * out[1] + vz * out[2] < 0) {
          const far = Math.hypot(x, y) || 1;
          x /= far;
          y /= far;
        }
        if (n === 0) ctx.moveTo(cx + x * radius, cy - y * radius);
        else ctx.lineTo(cx + x * radius, cy - y * radius);
      }
      ctx.closePath();
    }
    return seen;
  }

  /**
   * Draws the globe: the sea, the land, and the countries that are lit, each in its colour. look is
   * { sea, seaEdge, land, border, line, lit: Map of id to { fill, edge, thick }, dim: Set of ids drawn paler }.
   * Each country
   * is edged and then filled, one after another, so its edge shows against its neighbours and not inside itself,
   * where it's made of more than one outline.
   */
  draw(ctx, cx, cy, radius, look) {
    const sea = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.35, radius * 0.1, cx, cy, radius);
    sea.addColorStop(0, look.sea);
    sea.addColorStop(1, look.seaEdge);
    ctx.fillStyle = sea;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.lineJoin = 'round';
    // The borders are thin lines that stay thin however near the globe is brought. look.line is their width.
    const edge = look.line ?? Math.min(3, Math.max(1, radius * 0.004));
    const later = [];
    for (const country of this.countries) {
      const lit = look.lit?.get(country.id);
      if (lit) {
        later.push([country, lit]);
        continue;
      }
      ctx.beginPath();
      if (!this.trace(ctx, country, cx, cy, radius)) continue;
      ctx.strokeStyle = look.border;
      ctx.lineWidth = edge;
      ctx.stroke();
      ctx.fillStyle = look.dim?.has(country.id) ? look.dimmed : look.land;
      ctx.fill();
    }
    // The lit ones last, over their neighbours' edges, with an edge of their own that's easy to see.
    for (const [country, lit] of later) {
      ctx.beginPath();
      if (!this.trace(ctx, country, cx, cy, radius)) continue;
      ctx.strokeStyle = lit.edge;
      ctx.lineWidth = edge * (lit.thick ?? 2.5);
      ctx.stroke();
      ctx.fillStyle = lit.fill;
      ctx.fill();
    }
    ctx.restore();
  }
}
