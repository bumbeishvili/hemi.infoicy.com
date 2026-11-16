// Several people in front of one camera, each their own player. The tracker says where the bodies in the picture
// are, in no particular order, and that order can change from one look to the next. This keeps the players apart:
// each has a place across the picture, a body goes to the player whose place it's nearest, and the place goes
// with them as they move. No screen or camera in this file, so it runs in the unit tests.
//
// The players are told apart by where they stand and nothing else: the one furthest left on the screen is the
// first, and so on across. Two who swap sides stay themselves: each is looked for where they were heading, and
// the one nearer the camera is the taller in the picture. Anyone else in the picture can be taken for a player,
// so only the players should be in view: a game asks a grown-up how many are playing, and looks for that many.

export const MOST_PEOPLE = 4;
// How far across the picture someone may have moved between two looks and still be taken for the same player, as
// a share of the picture's width.
const REACH = 0.2;
// A player the camera hasn't seen for this long may be anyone it can't otherwise place, wherever they are now,
// as someone who stepped out of the picture comes back where they like.
const BACK_AFTER = 0.6;
// A player is looked for where they were heading, this far ahead in time at the most, in seconds.
const AHEAD_MOST = 0.25;
// Being as tall in the picture as the player was counts too, this much next to being in the right place: one
// who walks behind another is the smaller of the two the whole way across.
const TALL_COUNTS = 0.6;

// Which points of a body are its hips, shoulders and ankles: the tracker's own numbering.
const HIPS = [23, 24];
const SHOULDERS = [11, 12];
const ANKLES = [27, 28];
const mean = (points) => points.reduce((sum, value) => sum + value, 0) / points.length;

/**
 * Where a body is across the screen, from 0 at the left to 1 at the right. The screen shows the camera's picture
 * as a mirror does, so it's the other way across from the picture itself.
 */
export function acrossOf(body) {
  return 1 - mean(HIPS.map((index) => body.image[index].x));
}

/** How tall a body is in the picture, from its shoulders down to its ankles: the nearer the camera, the taller. */
export function tallOf(body) {
  return mean(ANKLES.map((index) => body.image[index].y)) - mean(SHOULDERS.map((index) => body.image[index].y));
}

/** Every way of giving each of some players one of some bodies, or none: each a list of body numbers, or -1. */
function waysToGive(players, bodies, used = new Set()) {
  if (!players) return [[]];
  const ways = [];
  for (let body = -1; body < bodies; body += 1) {
    if (body >= 0 && used.has(body)) continue;
    if (body >= 0) used.add(body);
    for (const rest of waysToGive(players - 1, bodies, used)) ways.push([body, ...rest]);
    if (body >= 0) used.delete(body);
  }
  return ways;
}

export class People {
  /** count is how many are playing, from 1 to MOST_PEOPLE. */
  constructor(count = 1) {
    this.count = Math.min(MOST_PEOPLE, Math.max(1, Math.round(count) || 1));
    this.forget();
  }

  /** Nobody has a place: the next time enough people are in the picture, they're taken left to right. */
  forget() {
    // Each { x, speed, tall, seenAt }, once the player has one: where across the screen, how fast they're going
    // across it, how tall in the picture, and when they were last seen.
    this.places = Array.from({ length: this.count }, () => null);
  }

  /** Whether every player has been given a place. */
  get placed() {
    return this.places.every(Boolean);
  }

  /**
   * The tracker has looked. bodies is whoever it found, in any order, and now the time in seconds. Returns a
   * list with each player's body, or null for a player it didn't find.
   */
  assign(bodies, now) {
    const found = (bodies ?? []).filter(Boolean);
    const mine = Array.from({ length: this.count }, () => null);
    if (!this.placed) {
      // To begin with, the players are whoever is nearest the camera, taken left to right across the screen,
      // once there are enough of them in the picture. Until then nobody is anyone.
      if (found.length < this.count) return mine;
      const nearest = [...found].sort((a, b) => tallOf(b) - tallOf(a)).slice(0, this.count);
      nearest.sort((a, b) => acrossOf(a) - acrossOf(b));
      nearest.forEach((body, player) => {
        this.places[player] = { x: acrossOf(body), speed: 0, tall: tallOf(body), seenAt: now };
        mine[player] = body;
      });
      return mine;
    }

    // Each body to the player whose place it's nearest, taking them all together: the way that leaves the
    // fewest players without a body, and of those the one with the least moving about.
    const xs = found.map(acrossOf);
    const talls = found.map(tallOf);
    // Where each player would be by now, going on the way they were.
    const expected = this.places.map((place) => place.x + place.speed * Math.min(AHEAD_MOST, Math.max(0, now - place.seenAt)));
    let best = null;
    for (const way of waysToGive(this.count, found.length)) {
      let given = 0;
      let moved = 0;
      let allowed = true;
      way.forEach((body, player) => {
        if (body < 0) return;
        const far = Math.abs(xs[body] - expected[player]);
        if (far > REACH) allowed = false;
        given += 1;
        moved += far + TALL_COUNTS * Math.abs(talls[body] - this.places[player].tall);
      });
      if (!allowed) continue;
      if (!best || given > best.given || (given === best.given && moved < best.moved)) best = { way, given, moved };
    }
    const taken = new Set();
    best.way.forEach((body, player) => {
      if (body < 0) return;
      taken.add(body);
      mine[player] = found[body];
    });
    // Someone who has been out of the picture a while may come back anywhere: a body that's nobody's goes to the
    // nearest of the players who've been gone that long.
    xs.forEach((x, body) => {
      if (taken.has(body)) return;
      const gone = this.places
        .map((place, player) => ({ place, player }))
        .filter(({ place, player }) => !mine[player] && now - place.seenAt >= BACK_AFTER)
        .sort((a, b) => Math.abs(a.place.x - x) - Math.abs(b.place.x - x))[0];
      if (gone) mine[gone.player] = found[body];
    });
    mine.forEach((body, player) => {
      if (!body) return;
      const before = this.places[player];
      const x = acrossOf(body);
      const passed = now - before.seenAt;
      // How fast they're going across, smoothed, and forgotten after a look that missed them.
      const speed = passed > 0 && passed < AHEAD_MOST ? before.speed * 0.5 + ((x - before.x) / passed) * 0.5 : 0;
      this.places[player] = { x, speed, tall: before.tall * 0.8 + tallOf(body) * 0.2, seenAt: now };
    });
    return mine;
  }
}
