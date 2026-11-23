// Playing with friends, in High Five Racers, Sky Wings, Balloon Pop, Mighty Moves, Bounce Back, Leap Trail, Giraffe's
// Maze, Cannon Bay, Tank Patrol, the Smoothie Stand, Spider Catcher, the Lighthouse Keeper, Giraffe's Garden, Frost
// Arena, Arrow Meadow, Giraffe's Puzzles, Flap, Little Chick!, Mighty Lift, Gobble and Grow, Giraffe's Paint Box,
// Moto Mountain, Rooftop Rope and Giraffe's Riddle Doors: who's in a room, and what they pass to each other.
// The same rules run on Cloudflare (server/worker.js) and on this computer for the tests
// (tools/race-server.mjs). Each game has rooms of its own. Nothing here is kept once everyone has gone, and no
// camera picture ever comes here: only where each car or plane is, the moves a fighter makes and how it stands,
// the name a player typed, and which character drives, flies or fights.
//
// A player sends JSON messages, each { t, ... }:
//   hi     { name, driver, level, length, mode, team, racing }   first, after connecting, and again if any of it
//                                      changes. length is the race's laps, a flight's planes to drop, or how
//                                      many balloons a game of Balloon Pop has, and mode its maths challenge.
//                                      In Giraffe's Maze, length is how many mazes, and mode their size and seed,
//                                      and at the Smoothie Stand, how many customers, and how fast the fruit flies.
//                                      In The Lighthouse Keeper, length is how many ships there are to bring home,
//                                      and in Giraffe's Garden how many plants there are to grow.
//                                      team is 1 for playing together rather than against each other, in the
//                                      games that have both: it's the host's that counts, as with the rest
//                                      racing says they're in the middle of one, for someone back mid-race
//   ready  {}                              they're waiting at the start
//   go     {}                              the host starts with whoever is ready
//   car    { ms, d, x, s, l, f, b }        where their car is, about 10 times a second, in a race
//   plane  { ms, x, y, z, h, p, r, s, f }  where their plane is, in a flight
//   score  { ms, n }                       how many they've popped, or got right, so far
//   hand   { ms, x, y, v, o, p }           where their glove is in Balloon Pop, from 0 to 1 across and down
//                                      the screen, whether it can be seen and is open, and p, its 21
//                                      points from the middle of the palm, as x, y, x, y..., in palms. In The
//                                      Lighthouse Keeper, x and y are across and down the window instead
//   world  { ms, b, q, qa }                the host's balloons in Balloon Pop, which everyone plays with:
//                                      each [id, x, y, r, colour, number, flags], and the sum being asked
//   claim  { k }                           this player's hand got to balloon k: the first to says so has it.
//                                      In Mighty Moves, k is a round this player's fighter has just won, and
//                                      in Giraffe's Garden a sip of water for a plant: plant * 100 + which sip,
//                                      and in Giraffe's Paint Box a part of the picture their stroke finished
//   hit    { r, m, d, tot, sm, sg, sd }    Mighty Moves: their fighter makes move m in round r, doing d, and
//                                      tot in all this round. sm is 1 for a small hit and sg for their
//                                      fighter's own finishing move, and sd the side, l or r, if it has one.
//                                      In Cannon Bay, one of their cannonballs hit the other ship, as their
//                                      game saw it, and tot is how many have so far
//                                      In Tank Patrol, a shot of theirs has hit the friend's tank, as their
//                                      game decides: m is the kind of shot, and tot how many hits they've made
//                                      In Frost Arena, against each other, a shot of theirs has hit another
//                                      player, as their game decides: r is which one, by their place in the order
//                                      everyone joined, from 1, sm is 1 for the lighter rifle, and tot how many
//                                      hits they've made on that player
//   pose   { ms, p }                       Mighty Moves: their body, for their fighter to copy, as POSE_NUMBERS
//                                      numbers about where their hands and feet are and how they lean (see
//                                      BODY_KEYS in games/mighty-moves/clips.js), or none when it can't be seen
//   racket { ms, x, y, v, o, r, g, p }     where their racket is in Bounce Back, along the court and how high,
//                                      whether it can be seen and is open, how big it is, how much it draws the
//                                      ball in, and p, their glove's 21 points, as in hand
//   ball   { ms, x, y, vx, vy, s, k, a, b, n, f, l, sv, g, r, w }   the host's ball in Bounce Back: where it is
//                                      and how it's going, what it's doing, which shot it is, the two scores,
//                                      the hits in a row, its kind, who hit it last, who served, who has won,
//                                      whether it's rolling, and whether the game is over
//   shot   { ms, k, x, y, vx, vy }         in Bounce Back, this player hit shot k, from there and that way. Only
//                                      the host's game hears it, as the host's game runs the ball
//   runner { ms, d, x, y, s, j, w, b }     where their runner is in Leap Trail: how far along, how far across,
//                                      how high, how fast, whether it's jumping or waiting, and how many times
//                                      it has stumbled
//   walker { ms, z, x, y, f, m, v, o, gx, gy, p }   where their character is in Giraffe's Maze: which maze, where in
//                                      it, in cells, which way it faces and whether it's walking, whether their
//                                      glove can be seen and is open, where it is, and p, its 21 points, as in hand.
//                                      Everyone makes the same mazes from the host's mode, its size and a seed, and
//                                      races out of them, each with all the fruit in their own. Walking out of a
//                                      maze, x goes past its right edge
//   wipe   { w, c }                        The Lighthouse Keeper: their hand has wiped patches c of window w, each
//                                      a whole number from 0 to WINDOW_PATCHES - 1, all of those since the last
//                                      wipe, sent at most 10 times a second. Each patch is the first hand's to wipe
//                                      it. A wipe with no answer is sent again, so a patch can come more than once
//   stand  { ms, g, f, c, l, a }           Giraffe's Smoothie Stand, from the game running the stand for everyone:
//                                      the host's, then the next still playing. f is the fruit, each [id, x, y,
//                                      vx, vy, t, s]: where it was at t, in milliseconds since "GO!", as shares of
//                                      the screen, how it was going, in shares a second, and s 1 if it hangs still;
//                                      g is how it falls, in screen heights a second squared. c is the customer, l
//                                      what's left of their order, and a how many claimed fruit the stand has
//                                      counted. Each player claims the fruit their glove slices, and its id says
//                                      what kind of fruit it was. Their glove goes as hand, and their points as score
//   ship   { ms, x, z, h, s, v, f, r }     where their ship is in Cannon Bay: where on the water, which way it
//                                      heads, how fast, how far its sails are up, from 0 to 1, f, how many
//                                      cannonballs it has fired so far, for the other game to show them coming,
//                                      and whether their child is resting
//   catcher { ms, x, y, v, o, p, z, h, m, n }   their glove in Spider Catcher: where it is in the garden, as a child
//                                      playing with the right hand and a little reach help would see it, 0 to 1 across
//                                      and down, whether it can be seen and is open, and p, its 21 points, as in hand.
//                                      z is which place in the garden they're at, h the spider in the glove, as the
//                                      claim it was caught with, or -1, m which of that place's spiders are home on
//                                      their screen, a bit each, and n how many they've brought home. Everyone makes
//                                      the same spiders from the seed, and claims each one their glove closes on
//   jigsaw { ms, x, y, v, o, p, h, n, d }  their glove in Giraffe's Puzzles: where it is on the table, 0 to 1 across
//                                      and down it, whether it can be seen and is open, and p, its 21 points, as in
//                                      hand. h is the piece in their hand, as the claim it was picked up with (the
//                                      piece's number times 1000, plus which grab of it this is), or -1, n how many
//                                      pieces they've put in place, and d each piece they were the last to hold, as
//                                      [claim, x, y, angle, placed]. Everyone lays the same puzzle out from the seed,
//                                      and claims each piece their open hand comes to. It's passed on to the others.
//                                      Giraffe's Riddle Doors sends the same, for its glove over the hall, the piece in
//                                      it and the doors it has opened, with angle always 0, and claims a piece that
//                                      didn't fit in the gap as 500000 plus the piece's number
//   tank   { ms, x, z, h, a, s, n, r, o }   where their tank is in Tank Patrol, across and along the valley, which
//                                      way it faces and its turret points, how fast it's going, how many shots it
//                                      has fired, so the friend's game can show them coming, whether their child
//                                      is resting, shown with little z's over it, and whether their hand is open
//   trooper { ms, x, z, h, s, p, f, n, k, v, u, g, r, o, a, b }   where they are in Frost Arena's yard, which way
//                                      they face, how fast they're going and whether that's a sprint, whether
//                                      they're firing, how many shots they've fired, so a friend's game can show
//                                      them, which of the two rifles, how much they have left, whether they're
//                                      sitting out after being tagged, only just back, or have their hands out of
//                                      the picture, o, how many times each of the others has tagged them out, in
//                                      the order everyone joined, which is how every game counts the same tags,
//                                      a, how many times they've been tagged out in all, and b, who by the last
//                                      time, as that one's number
//   foes   { ms, e, s, n }                 playing together against the computer's, from the host's game, which runs
//                                      them for everyone: in Tank Patrol, e is each robot tank still rolling, s each
//                                      shell coming over, and n how it's going, in Cannon Bay e is each pirate
//                                      ship afloat and s each of their cannonballs, and in Frost Arena e is Giraffe
//                                      and each of the red team. Each of e and s is a row of numbers, and n is
//                                      numbers: see wire in games/tank-patrol/team.js, games/cannon-bay/team.js and
//                                      games/frost-arena/team.js. Only numbers pass. If the host has gone, or isn't
//                                      playing, it's from the first of those playing: see runnerOf
//   tag    { k, n }                        this player's shot has hit the computer's k, n times in all so far, as
//                                      their own game decides. Only the game that runs them hears it
//   can    { ms, u, y, v, tip, f, p }      where their watering can is in Giraffe's Garden: u how far along the row of
//                                      plants, from the first to the last, so it's over the same plant on every
//                                      screen however far apart each one's are, y how far down the screen, whether
//                                      it can be seen, how far it's tipped and how much it's pouring, from 0 to 1,
//                                      and p, its glove's 21 points, as in hand
//   archer { ms, a, d, h, v, n, sa, sp, k }   how their bow is in Arrow Meadow: how far it's tilted, in radians, and
//                                      drawn, from 0 to 1, whether its string is held and their hands can be seen,
//                                      how many arrows they've let go, with the angle and the draw of the last, so a
//                                      friend's game can show it flying, and how many targets they've hit. Everyone
//                                      lays out the same targets from the seed. Together, each claims the ones their
//                                      own arrows hit, by number, and against each other the first to enough wins
//   chick  { ms, d, y, v, l, r, s, n, c }  where their chick is in Flap, Little Chick!: how far along the track, how
//                                      high, how fast, how far up each wing is, what it's doing, and how many flaps
//                                      and pieces of corn it has. Everyone lays out the same track from the seed
//   lifter { ms, u, a, n, f, r }           how far up their arm is in Mighty Lift, as a share of the way to their
//                                      own line, whether it's up at it, how many lifts they've made and friends
//                                      they've freed, and whether they're resting. length is how many lifts a game
//                                      has, and mode how long a hold is. Lifting one weight together, each game
//                                      claims a rescue, by its number, as it's done there, and their bodies go as pose
//   rider  { ms, s, x, l, h, v, n, c, w, d }  where their bike is in Moto Mountain: how far along the road and
//                                      where across it, how far over it leans, how high it is in a jump, how fast,
//                                      how many stars and bends ridden on the road, and whether it's waiting or
//                                      has finished. Everyone lays out the same road from the seed. length is how
//                                      many bends a ride has, and mode how fast the bike goes
//   balancer { ms, a, u, w, g, f, n, c, d }  where their walker is in Rooftop Rope: which rope it's on and how
//                                      far along it, how high the lifted foot is, how much the walker wobbles,
//                                      which foot is up, whether it's dropping into the net, how many stars and
//                                      ropes it has, and whether it has finished. Everyone lays out the same ropes
//                                      from the seed. length is how many ropes a game has, and mode how long a
//                                      rope takes
//   eater  { ms, x, y, m, n, v }           where their creature is in Gobble and Grow, across and down the soup
//                                      from 0 to 1, how far its mouth is open, from 0 to 1, how many bites it has
//                                      had, and whether their face can be seen. Everyone makes the same things to
//                                      eat from the seed. Playing together, each claims the things their creature
//                                      gobbles, as in Balloon Pop, and the first mouth to one has it
//   brush  { ms, x, y, v, o, c, r, p, s, d }   their brush in Giraffe's Paint Box, painting one sheet together: where
//                                      it is on the sheet, whether it can be seen and is down, its paint and its
//                                      size, p, its glove's 21 points, as in hand, s, the strokes painted since the
//                                      last one, as numbers (for each run: the part it's kept to or -1, the paint,
//                                      the size, how many points, and the points), and d, which parts are done, a
//                                      bit each. Whoever's stroke finishes a part claims it, as claim, by its number
//   done   { ms, n, w }                    they've finished, this long after "GO!", with n dropped, and w 1
//                                      if that's all of them (and in a race, always)
//   leave  {}                              they're going (closing the socket says the same)
// The room sends:
//   room   { you, members: [{ id, name, driver, ready, racing, host }], team }   whenever that changes. team is
//                                      the host's, so everyone can see how the game is going to be played
//   go     { level, length, laps, mode, team, racers, seed }   the countdown starts now, on the host's course
//                                      (laps is length). seed is the same for everyone, for a game laid out by chance
//   car, plane, score, hand, world, hit, pose, racket, ball, shot, runner, walker, stand, ship, catcher, tank, can, brush, trooper, foes, tag { from, ... } and done { from, ms, n, w }
//                                      passed on from the others: ball only from the host, shot only to the host,
//                                      foes only from the game that runs the computer's side and tag only to it,
//                                      and stand only from someone playing
//   claimed { k, by }                      balloon k, or round k, went to player by, sent to everyone, them too
//   wiped  { w, c, by }                    patches c of window w went to player by, as theirs wiped them first,
//                                      sent to everyone, them too. Those in a wipe that had gone to someone else
//                                      already are said again only to the one who sent it, with whose they are
//   full   {}                              the room already has as many as it holds: see mostIn
//   taken  {}                              making a new game, that code is already in use: choose another
//   nobody {}                              joining by a code, there's no game with it just now

export const MAX_RACERS = 4;
// A fight is two fighters, Bounce Back is one child on each side of the net, Cannon Bay is ship against ship,
// and a Tank Patrol battle is tank against tank. Every other game's room holds MAX_RACERS.
const MOST_IN = { 'mighty-moves': 2, 'bounce-back': 2, 'cannon-bay': 2, 'tank-patrol': 2 };
export const mostIn = (game) => MOST_IN[game] ?? MAX_RACERS;
export const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // No 0, O, 1, I or L, which look alike.
// A code is short enough to say out loud or type in a moment. A new game never takes one in use: see arrive.
export const CODE_LENGTH = 3;
const OLD_CODE_LENGTH = 6; // Links from before codes were 3 long still open their game.
export const MOST_BYTES = 1800; // A message bigger than this is ignored. The host's balloons are the biggest.
const MOST_BALLOONS = 24;
// The Lighthouse Keeper's windows: each is 14 by 9 patches of mud (see GRID in games/lighthouse/storm.js), and a
// storm has at most four of them, with room to spare.
export const WINDOW_PATCHES = 126;
const MOST_WINDOWS = 10;
const MOST_FRUIT = 16; // At the Smoothie Stand there are never more than 12 up at once, and a few on their way.
// Playing together against the computer's: how many of them, and of what they've fired, the host's game can tell
// of at once, and how many numbers each can have.
export const MOST_FOES = 24;
const MOST_FOE_NUMBERS = 12;
const MOST_A_SECOND = 40; // Messages a player can send in a second; more are dropped, apart from ALWAYS_HEARD.
const ALWAYS_HEARD = new Set(['ready', 'go', 'done', 'leave']);
// A player who goes and comes back as soon as this carries on as before, as when a laptop wakes up again.
export const COMES_BACK_WITHIN_MS = 120_000;
// A connection that's said nothing for this long, not even its keep-alive "ping", has died without closing.
const STALE_MS = 90_000;

/** A player's id, which a player who lost the connection for a moment brings back to keep their place. */
export const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{8,24}$/.test(id);

/** The id for a player arriving: the one they had, if they're coming back and nobody has it, or a new one. */
export function idFor(players, was, fresh) {
  return validId(was) && !players.some((player) => player.meta?.id === was) ? was : fresh();
}

/**
 * A player coming back with the id they had, whose old connection is still here: one that died without
 * closing, as when the wifi drops. The old one goes, quietly, and what was kept about them carries on with
 * the new one, so they keep their place, and hosting if they were. Returns that, or null.
 */
export function takeOver(players, was) {
  if (!validId(was)) return null;
  const old = players.find((player) => player.meta?.id === was);
  if (!old) return null;
  const kept = old.meta;
  old.setMeta(null);
  old.close();
  return kept;
}

export const validCode = (code) => typeof code === 'string' && [CODE_LENGTH, OLD_CODE_LENGTH].includes(code.length) && [...code].every((letter) => CODE_LETTERS.includes(letter));

/** A fresh room code, from a function giving random whole numbers below a limit. */
export function makeCode(randomBelow) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_LETTERS[randomBelow(CODE_LETTERS.length)];
  return code;
}

const number = (value, low, high, places) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const scale = 10 ** places;
  return Math.round(Math.min(high, Math.max(low, n)) * scale) / scale;
};

/** What a player is called: letters, numbers and a few marks, kept short. */
export function cleanName(value) {
  return String(value ?? '')
    .replace(/[^\p{L}\p{N} '.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
}

const cleanDriver = (value) => (typeof value === 'string' && /^[a-z][a-z-]{0,23}$/.test(value) ? value : '');
const cleanMove = (value) => (typeof value === 'string' && /^[a-zA-Z]{1,16}$/.test(value) ? value : '');
const cleanMode = (value) => (typeof value === 'string' && /^[A-Za-z]{1,12}$/.test(value) ? value : '');

/** Only what a plane message should hold, rounded. h is which way it heads, p and r its pitch and roll. */
export function cleanPlane(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    x: number(message.x, -5000, 5000, 2),
    y: number(message.y, -100, 2000, 2),
    z: number(message.z, -5000, 5000, 2),
    h: number(message.h, -7, 7, 3),
    p: number(message.p, -2, 2, 3),
    r: number(message.r, -2, 2, 3),
    s: number(message.s, 0, 300, 1),
    f: message.f ? 1 : 0,
  };
}

/** Only what a hand message should hold, rounded, with its 21 points or none. */
export function cleanHand(message) {
  const points = Array.isArray(message.p) && message.p.length === 42 ? message.p.map((value) => number(value, -4, 4, 2)) : [];
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    x: number(message.x, -0.5, 1.5, 3),
    y: number(message.y, -0.5, 1.5, 3),
    v: message.v && points.length ? 1 : 0,
    o: message.o ? 1 : 0,
    p: points,
  };
}

/** Only what the host's balloons should hold, rounded: each is [id, x, y, r, colour, number, flags]. */
export function cleanWorld(message) {
  const balloons = Array.isArray(message.b) ? message.b.slice(0, MOST_BALLOONS) : [];
  const b = balloons.filter((each) => Array.isArray(each) && each.length === 7).map(([id, x, y, r, colour, shown, flags]) => [
    number(id, 0, 1_000_000, 0),
    number(x, -0.5, 1.5, 3),
    number(y, -1, 2, 3),
    number(r, 0, 0.5, 3),
    number(colour, 0, 20, 0),
    number(shown, -1, 1000, 0),
    number(flags, 0, 7, 0),
  ]);
  const q = typeof message.q === 'string' ? message.q.replace(/[^0-9+\-−×÷=? ]/g, '').slice(0, 24) : '';
  return { ms: number(message.ms, 0, 3_600_000, 0), b, q, qa: message.qa ? 1 : 0 };
}

export const POSE_NUMBERS = 21;

/** Only what a fighter's body should hold, in Mighty Moves: POSE_NUMBERS numbers, rounded, or none. */
export function cleanPose(message) {
  const p = Array.isArray(message.p) && message.p.length === POSE_NUMBERS ? message.p.map((value) => number(value, -3, 3, 2)) : [];
  return { ms: number(message.ms, 0, 3_600_000, 0), p };
}

/** Only what a fighter's move should hold, in Mighty Moves. A move that isn't one is passed on as none. */
export function cleanHit(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    r: number(message.r, 1, 9, 0),
    m: cleanMove(message.m),
    d: number(message.d, 0, 200, 2),
    tot: number(message.tot, 0, 1000, 2),
    sm: message.sm ? 1 : 0,
    sg: message.sg ? 1 : 0,
    sd: message.sd === 'l' || message.sd === 'r' ? message.sd : '',
  };
}

/** Only what a runner message should hold, in Leap Trail, rounded. */
export function cleanRunner(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    d: number(message.d, -100, 100_000, 2),
    x: number(message.x, -5, 5, 2),
    y: number(message.y, 0, 10, 2),
    s: number(message.s, 0, 60, 1),
    j: message.j ? 1 : 0,
    w: message.w ? 1 : 0,
    b: number(message.b, 0, 999, 0),
  };
}

/** Only what a racket message should hold, rounded, with its glove's 21 points or none. */
export function cleanRacket(message) {
  const points = Array.isArray(message.p) && message.p.length === 42 ? message.p.map((value) => number(value, -4, 4, 2)) : [];
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    x: number(message.x, -2, 2, 3),
    y: number(message.y, -0.5, 3, 3),
    v: message.v ? 1 : 0,
    o: message.v && message.o ? 1 : 0,
    r: number(message.r, 0, 0.6, 3),
    g: number(message.g, 0, 2, 2),
    p: points,
  };
}

/** Only what the host's ball should hold, rounded. */
export function cleanBall(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    x: number(message.x, -2, 2, 3),
    y: number(message.y, -0.5, 3, 3),
    vx: number(message.vx, -6, 6, 3),
    vy: number(message.vy, -6, 6, 3),
    s: number(message.s, 0, 3, 0),
    k: number(message.k, 0, 1_000_000, 0),
    a: number(message.a, 0, 99, 0),
    b: number(message.b, 0, 99, 0),
    n: number(message.n, 0, 999, 0),
    f: number(message.f, 0, 7, 0),
    l: number(message.l, 0, 2, 0),
    sv: number(message.sv, 0, 2, 0),
    g: number(message.g, 0, 2, 0),
    r: message.r ? 1 : 0,
    w: message.w ? 1 : 0,
  };
}

/** Only what a shot in Bounce Back should hold, rounded. */
export function cleanShot(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    k: number(message.k, 0, 1_000_000, 0),
    x: number(message.x, -2, 2, 3),
    y: number(message.y, -0.5, 3, 3),
    vx: number(message.vx, -6, 6, 3),
    vy: number(message.vy, -6, 6, 3),
  };
}

/** Only what a walker in Giraffe's Maze should hold, rounded, with its glove's 21 points or none. */
export function cleanWalker(message) {
  const points = Array.isArray(message.p) && message.p.length === 42 ? message.p.map((value) => number(value, -4, 4, 2)) : [];
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    z: number(message.z, 0, 20, 0),
    x: number(message.x, -2, 40, 2),
    y: number(message.y, -2, 40, 2),
    f: number(message.f, 0, 3, 0),
    m: message.m ? 1 : 0,
    v: message.v ? 1 : 0,
    o: message.v && message.o ? 1 : 0,
    gx: number(message.gx, -4, 40, 2),
    gy: number(message.gy, -4, 40, 2),
    p: points,
  };
}

/**
 * Only what a wipe in The Lighthouse Keeper should hold: which window, and which of its patches, each a whole
 * number from 0 to WINDOW_PATCHES - 1, rounded, and each once. Anything else in the list is left out.
 */
export function cleanWipe(message) {
  const c = [];
  for (const value of Array.isArray(message.c) ? message.c : []) {
    const patch = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : -1;
    if (patch >= 0 && patch < WINDOW_PATCHES && !c.includes(patch)) c.push(patch);
  }
  return { w: number(message.w, 0, MOST_WINDOWS - 1, 0), c };
}

/**
 * Only what the Smoothie Stand should hold, rounded: each fruit as [id, x, y, vx, vy, t, s], the customer, what's
 * left of their order, and how many claimed fruit the stand has counted.
 */
export function cleanStand(message) {
  const fruit = Array.isArray(message.f) ? message.f.slice(0, MOST_FRUIT) : [];
  const f = fruit.filter((each) => Array.isArray(each) && each.length === 7).map(([id, x, y, vx, vy, t, s]) => [
    number(id, 0, 1_000_000, 0),
    number(x, -0.5, 1.5, 4),
    number(y, -1, 2, 4),
    number(vx, -2, 2, 4),
    number(vy, -4, 4, 4),
    number(t, 0, 3_600_000, 0),
    s ? 1 : 0,
  ]);
  const l = Array.isArray(message.l) ? message.l.slice(0, 3).map((left) => number(left, 0, 99, 0)) : [];
  return { ms: number(message.ms, 0, 3_600_000, 0), g: number(message.g, 0, 3, 4), f, c: number(message.c, 0, 9, 0), l, a: number(message.a, 0, 100_000, 0) };
}

/**
 * Only what a ship in Cannon Bay should hold, rounded: where it is on the water and which way it heads, how
 * fast it goes, how far its sails are up, f, how many cannonballs it has fired so far, and whether its child is
 * resting.
 */
export function cleanShip(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    x: number(message.x, -2000, 2000, 2),
    z: number(message.z, -2000, 2000, 2),
    h: number(message.h, -7, 7, 3),
    s: number(message.s, 0, 100, 1),
    v: number(message.v, 0, 1, 2),
    f: number(message.f, 0, 1_000_000, 0),
    r: message.r ? 1 : 0,
  };
}

/**
 * Only what a glove in Spider Catcher should hold, rounded, with its 21 points while it can be seen, or none. A spider
 * in it that isn't a number is none, -1.
 */
export function cleanCatcher(message) {
  const points = Array.isArray(message.p) && message.p.length === 42 ? message.p.map((value) => number(value, -4, 4, 2)) : [];
  const seen = message.v && points.length ? 1 : 0;
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    x: number(message.x, -0.5, 1.5, 3),
    y: number(message.y, -0.5, 1.5, 3),
    v: seen,
    o: seen && message.o ? 1 : 0,
    p: seen ? points : [],
    z: number(message.z, 0, 20, 0),
    h: typeof message.h === 'number' && Number.isFinite(message.h) ? number(message.h, -1, 1_000_000, 0) : -1,
    m: number(message.m, 0, 1023, 0),
    n: number(message.n, 0, 1000, 0),
  };
}

const MOST_PUZZLE_PIECES = 40; // Giraffe's Puzzles: more than a game of it ever has.

/**
 * Only what a player in Giraffe's Puzzles should tell: where their glove is on the table, from 0 to 1 across and
 * down it, whether it can be seen and is open, with its 21 points while it can be seen, or none, h, the claim of
 * the piece in their hand, or -1, n, how many pieces they've put in place, and d, each piece they were the last to
 * hold, as [claim, x, y, angle, placed]: where it lies on the table, how far it's turned, and 1 once it's in place.
 */
export function cleanJigsaw(message) {
  const points = Array.isArray(message.p) && message.p.length === 42 ? message.p.map((value) => number(value, -4, 4, 2)) : [];
  const seen = message.v && points.length ? 1 : 0;
  const pieces = Array.isArray(message.d) ? message.d.slice(0, MOST_PUZZLE_PIECES).filter((each) => Array.isArray(each) && each.length === 5) : [];
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    x: number(message.x, -0.5, 1.5, 3),
    y: number(message.y, -0.5, 1.5, 3),
    v: seen,
    o: seen && message.o ? 1 : 0,
    p: seen ? points : [],
    h: typeof message.h === 'number' && Number.isFinite(message.h) ? number(message.h, -1, 1_000_000, 0) : -1,
    n: number(message.n, 0, 1000, 0),
    d: pieces.map(([k, x, y, angle, placed]) => [number(k, 0, 1_000_000, 0), number(x, 0, 2, 3), number(y, 0, 1, 3), number(angle, -180, 180, 0), placed ? 1 : 0]),
  };
}

/** Only what a tank in Tank Patrol should hold, rounded: where it is in the valley, which way it and its turret point, and the rest. */
export function cleanTank(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    x: number(message.x, -60, 60, 2),
    z: number(message.z, -50, 40, 2),
    h: number(message.h, -4, 4, 3),
    a: number(message.a, -4, 4, 3),
    s: number(message.s, 0, 30, 1),
    n: number(message.n, 0, 100_000, 0),
    r: message.r ? 1 : 0,
    o: message.o ? 1 : 0,
  };
}

/**
 * Only what a watering can in Giraffe's Garden should hold, rounded: where it is, how far it's tipped and how much
 * it's pouring, with its glove's 21 points while it can be seen, or none.
 */
export function cleanCan(message) {
  const points = Array.isArray(message.p) && message.p.length === 42 ? message.p.map((value) => number(value, -4, 4, 2)) : [];
  const seen = message.v ? 1 : 0;
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    u: number(message.u, -0.5, 1.5, 3),
    y: number(message.y, -0.5, 1.5, 3),
    v: seen,
    tip: seen ? number(message.tip, 0, 1, 2) : 0,
    f: seen ? number(message.f, 0, 1, 2) : 0,
    p: seen ? points : [],
  };
}

/**
 * Only what a creature in Gobble and Grow should hold, rounded: where it is in the soup, how far its mouth is open,
 * how many bites it has had, and whether its child's face can be seen.
 */
export function cleanEater(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    x: number(message.x, -0.2, 1.2, 3),
    y: number(message.y, -0.2, 1.2, 3),
    m: number(message.m, 0, 1, 2),
    n: number(message.n, 0, 1000, 0),
    v: message.v ? 1 : 0,
  };
}

// Giraffe's Paint Box: the most numbers one brush message can hold of the strokes painted (see STROKE_NUMBERS in
// games/giraffe-paint/paint.js), and the most parts a picture has, each a bit of one whole number.
export const MOST_STROKE_NUMBERS = 120;
const MOST_PARTS = 30;

/**
 * Only what a brush in Giraffe's Paint Box should hold, rounded: where it is on the sheet, whether it can be seen
 * and is down, its paint and its size, its glove's 21 points while it can be seen, or none, the strokes painted,
 * as numbers and nothing else, no more of them than a message holds, and which parts are done, as one whole number.
 * What the numbers of a stroke mean is the game's own business, and it takes none of them on trust.
 */
export function cleanBrush(message) {
  const points = Array.isArray(message.p) && message.p.length === 42 ? message.p.map((value) => number(value, -4, 4, 2)) : [];
  const seen = message.v && points.length ? 1 : 0;
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    x: number(message.x, -60, 260, 1),
    y: number(message.y, -60, 260, 1),
    v: seen,
    o: seen && message.o ? 1 : 0,
    c: number(message.c, 0, 40, 0),
    r: number(message.r, 0, 40, 1),
    p: seen ? points : [],
    s: Array.isArray(message.s) ? message.s.slice(0, MOST_STROKE_NUMBERS).map((value) => number(value, -60, 260, 1)) : [],
    d: number(message.d, 0, 2 ** MOST_PARTS - 1, 0),
  };
}

const MOST_IN_THE_YARD = 4; // Frost Arena: as many as can play, and so as many counts of who tagged whom.

/**
 * Only what a player in Frost Arena's yard should hold, rounded: where they are and which way they face, how
 * fast they're going and whether that's a sprint, whether they're firing, how many shots they've fired, which
 * rifle, how much they have left, whether they're sitting out, only just back or have their hands out of the
 * picture, how many times each of the others has tagged them out, always that many whole numbers, whatever
 * came, how many times in all, and who by the last time, or -1 for nobody.
 */
export function cleanTrooper(message) {
  const counts = Array.isArray(message.o) ? message.o : [];
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    x: number(message.x, -25, 25, 2),
    z: number(message.z, -20, 20, 2),
    h: number(message.h, -7, 7, 3),
    s: number(message.s, 0, 20, 1),
    p: message.p ? 1 : 0,
    f: message.f ? 1 : 0,
    n: number(message.n, 0, 100_000, 0),
    k: message.k ? 1 : 0,
    v: number(message.v, 0, 1000, 0),
    u: message.u ? 1 : 0,
    g: message.g ? 1 : 0,
    r: message.r ? 1 : 0,
    o: Array.from({ length: MOST_IN_THE_YARD }, (_, index) => number(counts[index], 0, 1000, 0)),
    a: number(message.a, 0, 100_000, 0),
    b: typeof message.b === 'number' && Number.isFinite(message.b) ? number(message.b, -1, 99, 0) : -1,
  };
}

/**
 * Only what the host's game should tell of the computer's side, playing together against it: rows of numbers, and
 * nothing else. e is each of them, s each thing they've fired, and n how it's going. What each number means is the
 * game's own business, so each game has to make sense of them for itself, and take none of them on trust.
 */
export function cleanFoes(message) {
  const numbers = (row) => row.slice(0, MOST_FOE_NUMBERS).map((value) => number(value, -1_000_000, 1_000_000, 3));
  const rows = (list) => (Array.isArray(list) ? list.slice(0, MOST_FOES).filter((row) => Array.isArray(row)).map(numbers) : []);
  return { ms: number(message.ms, 0, 3_600_000, 0), e: rows(message.e), s: rows(message.s), n: Array.isArray(message.n) ? numbers(message.n) : [] };
}

/** Only what a hit on one of the computer's should hold: which one, and how many times this player has hit it. */
export function cleanTag(message) {
  return { k: number(message.k, 0, 1_000_000, 0), n: number(message.n, 0, 1000, 0) };
}

/**
 * Only what a bow in Arrow Meadow should hold, rounded: how far it's tilted, in radians, and drawn, whether its
 * string is held and its child's hands can be seen, how many arrows it has let go, with the angle and the draw of
 * the last of them, and how many targets its child has hit.
 */
export function cleanArcher(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    a: number(message.a, -1.6, 1.6, 3),
    d: number(message.d, 0, 1, 2),
    h: message.h ? 1 : 0,
    v: message.v ? 1 : 0,
    n: number(message.n, 0, 100_000, 0),
    sa: number(message.sa, -1.6, 1.6, 3),
    sp: number(message.sp, 0, 1, 2),
    k: number(message.k, 0, 1000, 0),
  };
}

/**
 * Only what a chick in Flap, Little Chick! should hold, rounded: how far along the track it is, how high, how fast
 * it's going, how far up each wing is, from 0 to 1, what it's doing, as a whole number (see STATES in
 * games/chick-flap/flock.js), and how many flaps and pieces of corn it has.
 */
export function cleanChick(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    d: number(message.d, -10, 10_000, 2),
    y: number(message.y, 0, 10, 2),
    v: number(message.v, 0, 20, 2),
    l: number(message.l, 0, 1, 2),
    r: number(message.r, 0, 1, 2),
    s: number(message.s, 0, 8, 0),
    n: number(message.n, 0, 100_000, 0),
    c: number(message.c, 0, 10_000, 0),
  };
}

/**
 * Only what a lifter in Mighty Lift should hold, rounded: how far up their arm is, as a share of the way to their
 * own line, whether it's up at it, how many lifts they've made and friends they've freed, and whether they're resting.
 */
export function cleanLifter(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    u: number(message.u, 0, 2, 2),
    a: message.a ? 1 : 0,
    n: number(message.n, 0, 10_000, 0),
    f: number(message.f, 0, 1000, 0),
    r: message.r ? 1 : 0,
  };
}

/**
 * Only what a bike in Moto Mountain should hold, rounded: how far along the road it is and where across it, how
 * far over it leans, as a share of a whole lean, how high it is in a jump, how fast it's going, how many stars
 * and bends ridden on the road it has, and whether it's waiting or has finished.
 */
export function cleanRider(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    s: number(message.s, 0, 4000, 1),
    x: number(message.x, -8, 8, 2),
    l: number(message.l, -1.3, 1.3, 2),
    h: number(message.h, 0, 3, 2),
    v: number(message.v, 0, 40, 1),
    n: number(message.n, 0, 200, 0),
    c: number(message.c, 0, 20, 0),
    w: message.w ? 1 : 0,
    d: message.d ? 1 : 0,
  };
}

/**
 * Only what a walker's message in Rooftop Rope should hold, rounded and kept to the ropes. a is the rope's
 * number with how far along it added on, u how high the foot is in whole lifts, and g which foot is up: -1 for
 * the left, 1 for the right, and 0 for neither.
 */
export function cleanBalancer(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    a: number(message.a, 0, 9, 3),
    u: number(message.u, 0, 2.5, 2),
    w: number(message.w, 0, 1, 2),
    g: number(message.g, -1, 1, 0),
    f: message.f ? 1 : 0,
    n: number(message.n, 0, 200, 0),
    c: number(message.c, 0, 8, 0),
    d: message.d ? 1 : 0,
  };
}

/** Only what a car message should hold, rounded, so nothing else can be passed on. */
export function cleanCar(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    d: number(message.d, -100, 100_000, 2),
    x: number(message.x, -20, 20, 2),
    s: number(message.s, 0, 100, 1),
    l: number(message.l, 0, 20, 2),
    f: message.f ? 1 : 0,
    b: message.b ? 1 : 0,
  };
}

const byJoining = (a, b) => a.meta.joined - b.meta.joined || (a.meta.id < b.meta.id ? -1 : 1);

/** Who hosts: whoever has been in the room longest. */
function hostOf(players) {
  return players.reduce((first, player) => (!first || player.meta.joined < first.meta.joined || (player.meta.joined === first.meta.joined && player.meta.id < first.meta.id) ? player : first), null);
}

/**
 * Whose game runs the computer's side, playing together against it: the host's, while they're playing. If
 * they've gone in the middle, or are in the room without playing, it's the first of those playing, which is how
 * each game works it out for itself too, so the game goes on for the rest.
 */
function runnerOf(players) {
  return hostOf(players.filter((each) => each.meta.racing)) ?? hostOf(players);
}

/**
 * The rules of one room. room.players() is everyone connected now, each as { meta, setMeta(meta), send(message),
 * close(), heardAt }: meta is what's kept about them, { id, joined, seen, name, driver, level, laps, ready, racing },
 * and heardAt when anything last came from them, even a keep-alive "ping". now() is the time in milliseconds.
 * recent, who has just gone, is all that's kept between calls, and the Cloudflare server saves it, as it can
 * sleep in between.
 */
export class RaceRoom {
  constructor(room, now = () => Date.now()) {
    this.room = room;
    this.now = now;
    this.counts = new Map(); // id: { second, count }, to drop a flood of messages. Fine to lose.
    this.recent = new Map(); // id: { meta, at }, for those who have just gone: see cameBack. Fine to lose too.
    this.claims = new Map(); // Balloon Pop: which balloon went to whom, this game. Cleared as each one starts.
    this.patches = new Map(); // The Lighthouse Keeper: which patch of which window went to whom, this game. The same.
  }

  /** What was kept about a player who went a moment ago and is back with their id, or null. */
  cameBack(was) {
    const now = this.now();
    for (const [id, { at }] of this.recent) if (now - at > COMES_BACK_WITHIN_MS) this.recent.delete(id);
    const recent = this.recent.get(was);
    if (!recent) return null;
    this.recent.delete(was);
    return recent.meta;
  }

  /**
   * A new player has connected. They're given an id and a seat, or told why not. kept is what was kept about
   * them from a connection they're taking over: see takeOver. most is how many the room holds. making says
   * they're making a new game, which must have a code nobody is using, even someone who has only just lost the
   * connection and is coming back. fresh says they're joining by a code, which needs a game to be there.
   */
  arrive(player, id, kept = null, { most = MAX_RACERS, making = false, fresh = false } = {}) {
    if (kept) {
      player.setMeta({ ...kept, id, seen: this.now() });
      this.tellEveryone();
      return true;
    }
    const now = this.now();
    // Someone whose connection died without closing doesn't keep the place a friend coming back needs.
    for (const each of this.room.players()) {
      if (each !== player && each.meta?.id && now - (each.heardAt ?? now) > STALE_MS) {
        each.close?.();
        this.leave(each);
      }
    }
    const others = this.room.players().filter((each) => each !== player && each.meta?.id);
    const comingBack = [...this.recent.values()].some(({ at }) => now - at <= COMES_BACK_WITHIN_MS);
    if (making && (others.length || comingBack)) {
      player.send({ t: 'taken' });
      return false;
    }
    if (fresh && !others.length && !comingBack) {
      player.send({ t: 'nobody' });
      return false;
    }
    if (others.length >= most) {
      player.send({ t: 'full' });
      return false;
    }
    player.setMeta({ id, joined: now, seen: now, name: '', driver: '', level: 1, length: 2, mode: '', team: 0, ready: false, racing: false });
    this.tellEveryone();
    return true;
  }

  /** A message from a player, as the text that came in. */
  hear(player, text) {
    const { meta } = player;
    if (!meta?.id || typeof text !== 'string' || text.length > MOST_BYTES) return;
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;
    // Being ready, starting, finishing and going always get through, however much else has come: each only
    // matters once, and a finish lost would leave friends waiting for it.
    if (!ALWAYS_HEARD.has(message.t) && this.flooding(meta.id)) return;
    const players = this.room.players().filter((each) => each.meta?.id);
    const others = players.filter((each) => each !== player);
    switch (message.t) {
      case 'hi': {
        // Laps or planes up to 9, or balloons up to 60.
        const length = number(message.length ?? message.laps, 1, 100, 0) || meta.length;
        // Coming back mid-race, after losing the connection for a moment, they're still racing.
        const racing = meta.racing || (Boolean(message.racing) && !meta.ready);
        player.setMeta({ ...meta, name: cleanName(message.name), driver: cleanDriver(message.driver), level: number(message.level, 1, 10, 0) || 1, length, mode: cleanMode(message.mode), team: message.team ? 1 : 0, racing });
        this.tellEveryone();
        break;
      }
      case 'ready': {
        if (meta.ready && !meta.racing) return;
        player.setMeta({ ...meta, ready: true, racing: false });
        if (!this.startIfAllReady()) this.tellEveryone();
        break;
      }
      case 'go':
        if (hostOf(players) === player && meta.ready) this.start();
        break;
      case 'score':
        for (const other of others) other.send({ t: 'score', from: meta.id, ms: number(message.ms, 0, 3_600_000, 0), n: number(message.n, 0, 1000, 0) });
        break;
      case 'world':
        // Only the host's balloons are everyone's.
        if (hostOf(players) !== player) return;
        for (const other of others) other.send({ t: 'world', from: meta.id, ...cleanWorld(message) });
        break;
      case 'claim': {
        // The first hand to get there has it, and everyone is told who that was.
        const k = number(message.k, 0, 1_000_000, 0);
        if (!meta.racing || this.claims.has(k)) return;
        this.claims.set(k, meta.id);
        for (const each of players) each.send({ t: 'claimed', k, by: meta.id });
        break;
      }
      case 'wipe': {
        // The first hand to wipe a patch has it, and everyone is told which this player got. Those that had gone
        // to someone already are said again, only to this player, so a game that missed hearing it, as when the
        // connection dropped, still learns whose they are.
        if (!meta.racing) return;
        const { w, c } = cleanWipe(message);
        const got = [];
        const theirs = new Map();
        for (const patch of c) {
          const key = w * WINDOW_PATCHES + patch;
          const owner = this.patches.get(key);
          if (owner === undefined) {
            this.patches.set(key, meta.id);
            got.push(patch);
          } else {
            if (!theirs.has(owner)) theirs.set(owner, []);
            theirs.get(owner).push(patch);
          }
        }
        if (got.length) for (const each of players) each.send({ t: 'wiped', w, c: got, by: meta.id });
        for (const [by, patches] of theirs) player.send({ t: 'wiped', w, c: patches, by });
        break;
      }
      case 'hit':
        if (!meta.racing) return;
        for (const other of others) other.send({ t: 'hit', from: meta.id, ...cleanHit(message) });
        break;
      case 'ball':
        // Only the host's ball is everyone's.
        if (hostOf(players) !== player) return;
        for (const other of others) other.send({ t: 'ball', from: meta.id, ...cleanBall(message) });
        break;
      case 'stand':
        // The Smoothie Stand, from whoever runs it: the host's game, and if that goes, the next still playing,
        // which each game works out for itself, so here it only has to come from someone playing.
        if (!meta.racing) return;
        for (const other of others) other.send({ t: 'stand', from: meta.id, ...cleanStand(message) });
        break;
      case 'jigsaw':
        // Giraffe's Puzzles: each one's glove, and the pieces they've had in it, go to everyone else.
        for (const other of others) other.send({ t: 'jigsaw', from: meta.id, ...cleanJigsaw(message) });
        break;
      case 'shot': {
        // Only the host's game runs the ball, so only it hears a shot, and only from someone playing.
        const host = hostOf(players);
        if (!meta.racing || host === player || !host) return;
        host.send({ t: 'shot', from: meta.id, ...cleanShot(message) });
        break;
      }
      case 'foes':
        // Only one game runs the computer's side, for everyone playing together against it.
        if (runnerOf(players) !== player) return;
        for (const other of others) other.send({ t: 'foes', from: meta.id, ...cleanFoes(message) });
        break;
      case 'tag': {
        // And so only that game hears of a hit on one of them, and only from someone playing.
        const runner = runnerOf(players);
        if (!meta.racing || runner === player || !runner) return;
        runner.send({ t: 'tag', from: meta.id, ...cleanTag(message) });
        break;
      }
      case 'brush':
        // Giraffe's Paint Box: the brush of each one playing, and the strokes it has painted, go to the others.
        if (!meta.racing) return;
        for (const other of others) other.send({ t: 'brush', from: meta.id, ...cleanBrush(message) });
        break;
      case 'car':
      case 'plane':
      case 'hand':
      case 'pose':
      case 'racket':
      case 'runner':
      case 'walker':
      case 'ship':
      case 'catcher':
      case 'tank':
      case 'trooper':
      case 'can': {
        const moved = { car: cleanCar, plane: cleanPlane, hand: cleanHand, pose: cleanPose, racket: cleanRacket, runner: cleanRunner, walker: cleanWalker, ship: cleanShip, catcher: cleanCatcher, tank: cleanTank, trooper: cleanTrooper, can: cleanCan }[message.t](message);
        for (const other of others) other.send({ t: message.t, from: meta.id, ...moved });
        break;
      }
      case 'archer':
        // Arrow Meadow: how their bow is, and what they've let go, for the others' games to show.
        for (const other of others) other.send({ t: 'archer', from: meta.id, ...cleanArcher(message) });
        break;
      case 'chick':
        // Flap, Little Chick!: where their chick is, to everyone else.
        for (const other of others) other.send({ t: 'chick', from: meta.id, ...cleanChick(message) });
        break;
      case 'lifter':
        // Mighty Lift: each lifter's arm goes to the others.
        for (const other of others) other.send({ t: 'lifter', from: meta.id, ...cleanLifter(message) });
        break;
      case 'rider':
        // Moto Mountain: where each bike is on the road goes to the others.
        if (!meta.racing) return;
        for (const other of others) other.send({ t: 'rider', from: meta.id, ...cleanRider(message) });
        break;
      case 'balancer':
        // Rooftop Rope: where each walker is on the ropes goes to the others.
        if (!meta.racing) return;
        for (const other of others) other.send({ t: 'balancer', from: meta.id, ...cleanBalancer(message) });
        break;
      case 'eater':
        // Gobble and Grow: where their creature is, for everyone else to see it.
        for (const other of others) other.send({ t: 'eater', from: meta.id, ...cleanEater(message) });
        break;
      case 'done':
        if (!meta.racing) return;
        player.setMeta({ ...meta, racing: false });
        for (const other of others) other.send({ t: 'done', from: meta.id, ms: number(message.ms, 0, 3_600_000, 0), n: number(message.n, 0, 1000, 0), w: message.w === 0 ? 0 : 1 });
        this.tellEveryone();
        break;
      case 'leave':
        this.leave(player);
        break;
      default:
    }
  }

  /** A player has gone, by leaving or by their connection closing. */
  leave(player) {
    if (!player.meta?.id) return;
    this.counts.delete(player.meta.id);
    this.recent.set(player.meta.id, { meta: player.meta, at: this.now() });
    player.setMeta(null);
    if (!this.startIfAllReady()) this.tellEveryone();
  }

  /** Everyone's ready, and there's someone to race: off they go. Otherwise the host can start anyway. */
  startIfAllReady() {
    const everyone = this.room.players().filter((each) => each.meta?.id);
    if (everyone.length < 2 || !everyone.every((each) => each.meta.ready)) return false;
    this.start();
    return true;
  }

  /** The race starts on the host's course, for everyone who's ready. */
  start() {
    const players = this.room.players().filter((each) => each.meta?.id);
    const host = hostOf(players);
    // In the order they came, the host first, which is the order they line up in on every computer.
    const racers = players.filter((each) => each.meta.ready).sort(byJoining);
    if (!host || !racers.length) return;
    for (const racer of racers) racer.setMeta({ ...racer.meta, ready: false, racing: true });
    this.claims.clear();
    this.patches.clear();
    const { level, length, mode, team } = host.meta;
    // One seed for everyone, so a game laid out by chance is laid out the same on every computer.
    const seed = Math.floor(Math.random() * 2 ** 31);
    const go = { t: 'go', level, length, laps: length, mode, team: team ? 1 : 0, racers: racers.map((each) => each.meta.id), seed };
    for (const player of players) player.send(go);
    this.tellEveryone();
  }

  /** Everyone is told who's here now, and each which of them they are. */
  tellEveryone() {
    const players = this.room.players().filter((each) => each.meta?.id);
    const host = hostOf(players);
    const members = players
      .slice()
      .sort(byJoining)
      .map(({ meta }) => ({ id: meta.id, name: meta.name, driver: meta.driver, ready: meta.ready, racing: meta.racing, host: meta.id === host?.meta.id }));
    // How the host has it: together, or against each other.
    const team = host?.meta.team ? 1 : 0;
    for (const player of players) player.send({ t: 'room', you: player.meta.id, members, team });
  }

  flooding(id) {
    const second = Math.floor(this.now() / 1000);
    const count = this.counts.get(id);
    if (!count || count.second !== second) {
      this.counts.set(id, { second, count: 1 });
      return false;
    }
    count.count += 1;
    return count.count > MOST_A_SECOND;
  }
}
