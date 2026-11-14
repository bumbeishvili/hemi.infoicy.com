// Giraffe's Garden: Giraffe's garden has dried up in the sun, and the child waters it back to life with his watering
// can. The open hand holds the can, and turning the hand over tips it, so the water pours. Each plant it falls on
// grows, and flowers once it has had enough, and once every one is in flower, the bees come to the party.
//
// The rules are here, with no screen, so they run in the unit tests. main.js says where the can is and how much it
// pours, from the hand (see core/turn.js), and view.js draws what this says. Places are in shares of the screen, x
// across from the left and y down from the top.
//
// On their own, the sun dries the garden as it comes: every plant not yet in flower gets thirstier, and a splash of
// water puts that right, but a plant left too long wilts, and that's the end of the garden. It only gets thirstier
// while the hand is in the picture, so a child who goes away, or whose hand the camera loses, comes back to it as they
// left it. A grown-up can choose the gentle garden instead, which is the game as it always was: nothing has a time
// limit, nothing dries out and nothing can be missed.
//
// With friends, everyone waters the same garden, each on their own computer. The water goes to a plant a sip at a
// time: each game claims the sips its child's can pours, and the server says whose each one is (claimed), the first
// to claim it having it. A plant grows by every sip anyone got, so it grows the same on every computer, flowers on
// all of them at once, and two children watering it grow it twice as fast.
import { clampLevel, ramp, stepsAt } from '../../core/levels.js';

export const GROUND = 0.9; // Where the plants stand.
// How far apart the plants are, which is how far there is to reach: the first and last plant's places across.
export const SPREADS = { close: [0.3, 0.7], middle: [0.2, 0.8], wide: [0.1, 0.9] };
export const SPREAD_NAMES = Object.keys(SPREADS);
export const PLANT_COUNTS = [4, 6, 8];
export const STREAM = 0.02; // How wide the can's water is, either side of its middle, in screen widths.
export const SPRINKLED = 0.09; // And with the sprinkler on it.
// How far either side of its middle a plant catches water: wider than it looks, for a hand that can't aim closely.
const REACH = 0.035;
export const STAGES = 3; // A plant shows how far it has grown in this many steps before it flowers.
// How tall each stands in flower, in screen heights. One in a hanging basket trails over its edge, so it's shorter.
export const TALL = { flower: 0.2, sunflower: 0.38, bean: 0.66, hanging: 0.1 };
export const SEEDLING = 0.07; // And how tall it starts, as a little dry shoot.
export const KINDS = ['daisy', 'tulip', 'poppy', 'cornflower', 'pansy', 'marigold'];
export const BASKET_Y = 0.44; // Where a hanging basket's plant stands.
export const TOUCH = 0.09; // How near the can has to come to the sprinkler or the cloud to take it, in screen heights.
// The sun drying the garden, as a grown-up chooses: it does (the default), or the gentle garden, in which it doesn't.
export const SUNS = ['dries', 'gentle'];
// How the sun dries it: seconds of the hand in the picture before a plant nobody waters wilts, from level 1's to level
// 10's, and the seconds of water that make a thirsty plant quite fresh again.
export const DRYING = { wilt: [45, 16], fresh: 0.4, wiltedSeconds: 2.4 };

// What the levels bring. Missing any of it never costs anything.
export const EXTRAS = {
  snailSplash: 0.7, // Seconds of water on a snail before it slides off its plant, happily.
  sprinklerSeconds: 8, // Seconds of pouring the sprinkler lasts. It only runs down while the can pours.
  sunflowerNeeds: 2, // How many flowers' water a sunflower needs.
  bowlNeeds: 1, // Seconds of water that fill the hedgehog's bowl.
  bunnyDown: 5, // Seconds the bunny stays down its hole, then pops up for bunnyUp.
  bunnyUp: 3.5,
  bunnySplash: 0.3, // Seconds of water on it that make it giggle.
  bunnyGifts: 3, // Carrots it gives at most.
  cloudSeconds: 7, // How long the rain cloud rains, drifting across the garden.
  cloudRain: 0.07, // How wide its rain is, either side of its middle.
  cloudSpeed: 0.09, // Screen widths a second.
  beanNeeds: 3,
};
// With friends: how much water a sip is, in seconds of it, and how long a sip claimed can wait for an answer before
// it's given up and claimed again, as the connection may have lost it.
export const SIP = 0.2;
const ASK_AGAIN_SECONDS = 2;
export const BEE_SECONDS = 2.6; // A bee flies in to a new flower and away again with its honey over this long.
export const PARTY_SECONDS = 2.4; // The bees' party, once every plant is in flower, before the finish card.

/** What changes from level 1 to 10. Each level from 2 brings something new: see NEWS. */
export function gardenLevel(level) {
  const at = clampLevel(level);
  return {
    // Seconds of water a flower needs, turned all the way: a little more each level, so each turn is held longer.
    need: ramp(at, 1.6, 2.4),
    // On their own, with the sun drying the garden: seconds before a plant nobody waters wilts.
    wilt: ramp(at, DRYING.wilt[0], DRYING.wilt[1]),
    // From level 2, a bee comes to each new flower and takes its honey to the tally.
    bees: at >= 2,
    // From level 3, a snail munching a plant, which won't grow until a splash sends it sliding off. Two from 9.
    snails: stepsAt(at, { 1: 0, 3: 1, 9: 2 }),
    // From level 4, a sprinkler for the can, which waters a wide patch at once for a while.
    sprinkler: at >= 4,
    // From level 5, a sunflower, which grows twice as tall and needs twice the water.
    sunflower: at >= 5,
    // From level 6, a thirsty hedgehog, whose bowl the can fills, and who leaves an apple.
    hedgehog: at >= 6,
    // From level 7, a bunny that pops up from its hole now and then, and gives a carrot for a splash.
    bunny: at >= 7,
    // From level 8, two of the plants hang in baskets up high, so the can has to be reached up to water them.
    baskets: stepsAt(at, { 1: 0, 8: 2 }),
    // From level 9, a rain cloud, which rains across the garden for a while once the can touches it.
    cloud: at >= 9,
    // At level 10, a magic bean, which grows up into the sky and has a golden egg at the top.
    bean: at >= 10,
  };
}

// What each level brings that's new, for the title card, the countdown and the finish card. key says which part of
// gardenLevel turns it on, which the unit tests check.
export const NEWS = {
  2: [{ key: 'bees', mark: '🐝', name: 'Bees and honey', nameKa: 'ფუტკრები და თაფლი' }],
  3: [{ key: 'snails', mark: '🐌', name: 'A hungry snail', nameKa: 'მშიერი ლოკოკინა' }],
  4: [{ key: 'sprinkler', mark: '💦', name: 'The sprinkler', nameKa: 'წყლის საფრქვევი' }],
  5: [{ key: 'sunflower', mark: '🌻', name: 'A sunflower', nameKa: 'მზესუმზირა' }],
  6: [{ key: 'hedgehog', mark: '🦔', name: 'A thirsty hedgehog', nameKa: 'მწყურვალი ზღარბი' }],
  7: [{ key: 'bunny', mark: '🐰', name: 'A peekaboo bunny', nameKa: 'კურდღელი სოროში' }],
  8: [{ key: 'baskets', mark: '🧺', name: 'Hanging baskets', nameKa: 'ჩამოკიდებული კალათები' }],
  9: [{ key: 'cloud', mark: '🌧️', name: 'A rain cloud', nameKa: 'საწვიმარი ღრუბელი' }],
  10: [{ key: 'bean', mark: '🫘', name: 'The magic bean', nameKa: 'ჯადოსნური ლობიო' }],
};

// The little label each new thing has beside it the first time it comes in a game, in English and Georgian. Nothing
// new is said out loud.
export const LABELS = {
  bee: ['A bee brings honey!', 'ფუტკარს თაფლი მოაქვს!'],
  snail: ['Splash the snail!', 'ლოკოკინას წყალი შეასხი!'],
  sprinkler: ['Touch the sprinkler!', 'შეეხე საფრქვევს!'],
  sunflower: ['A thirsty sunflower!', 'მწყურვალი მზესუმზირა!'],
  hedgehog: ['Fill the hedgehog’s bowl!', 'ზღარბს ჯამი აუვსე!'],
  bunny: ['Splash the bunny!', 'კურდღელს წყალი შეასხი!'],
  basket: ['Reach up high!', 'ზემოთ აწიე!'],
  cloud: ['Touch the cloud!', 'ღრუბელს შეეხე!'],
  bean: ['A magic bean!', 'ჯადოსნური ლობიო!'],
};

/** What's new at a level, as [{ key, mark, name, nameKa }]. Nothing at level 1. */
export const gardenNewAt = (level) => NEWS[clampLevel(level)] ?? [];

/** Whether the part of a level that a piece of news names is on. */
export function newsIsOn(key, level) {
  const plan = gardenLevel(level);
  return typeof plan[key] === 'number' ? plan[key] > 0 : Boolean(plan[key]);
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export class Garden {
  /**
   * level is the level played, plants how many to grow and spread how far apart they are (see SPREADS), as a
   * grown-up chose. plain leaves out everything the levels bring, as with friends. aspect is the screen's width
   * for its height, for how near the can comes to things. shared is { claim(k) } with friends, and me this child's
   * id among them. onEvent hears what happens: see main.js.
   */
  constructor({ level = 1, plants = 6, spread = 'middle', plain = false, sun = 'dries', shared = null, me = 'me', aspect = 16 / 9, random = Math.random, onEvent = () => {} } = {}) {
    Object.assign(this, { aspect, random, onEvent, shared, me });
    // Whether the sun dries the garden: on their own, unless the gentle garden was chosen. With friends it doesn't, as
    // each computer would judge a wilting plant a moment apart.
    this.drying = !plain && !shared && sun !== 'gentle';
    this.wilted = null; // The plant that wilted, which ends the garden.
    this.lost = false;
    this.wiltedFor = 0;
    this.tally = new Map(); // With friends, how many sips each one has given, by their id.
    this.level = clampLevel(level);
    const full = gardenLevel(level);
    this.plan = plain ? { ...full, bees: false, snails: 0, sprinkler: false, sunflower: false, hedgehog: false, bunny: false, baskets: 0, cloud: false, bean: false } : full;
    this.time = 0;
    this.done = false;
    this.stats = { flowers: 0, pours: 0, poured: 0, longest: 0, prizes: { honey: 0, apple: 0, carrot: 0, egg: 0 }, snails: 0 };
    this.pouring = false;
    this.pourFor = 0;
    this.splash = null; // Where the water lands now, for view.js: { x, y, wide }.
    this.lay(PLANT_COUNTS.includes(plants) ? plants : 6, SPREADS[spread] ?? SPREADS.middle);
  }

  /** Where everything goes, at the start. */
  lay(count, [from, to]) {
    const { plan } = this;
    const step = count > 1 ? (to - from) / (count - 1) : 0;
    this.plants = Array.from({ length: count }, (_, index) => ({
      id: index,
      kind: KINDS[index % KINDS.length],
      look: 'flower',
      x: count > 1 ? from + step * index : (from + to) / 2,
      y: GROUND,
      water: 0,
      thirst: 0, // With the sun drying the garden, from 0, fresh, to 1, which is wilted.
      need: plan.need,
      bloomed: false,
      stage: 0,
      hanging: false,
      // With friends: whose each of its sips was, the sips this game has claimed and not heard about, by when,
      // and water poured on it not yet claimed.
      sips: new Map(),
      asked: new Map(),
      pending: 0,
    }));
    const middle = Math.floor((count - 1) / 2);
    // The newest things take the plants nearest the middle, so they're in easy reach, the others further out.
    const free = this.plants.slice().sort((a, b) => Math.abs(a.id - middle) - Math.abs(b.id - middle));
    const take = () => free.shift();
    if (plan.bean) Object.assign(take(), { look: 'bean', kind: 'bean', need: plan.need * EXTRAS.beanNeeds });
    if (plan.sunflower) Object.assign(take(), { look: 'sunflower', kind: 'sunflower', need: plan.need * EXTRAS.sunflowerNeeds });
    // Baskets hang up high in the places of the second plant from each end, or the flowers nearest them.
    for (const wanted of [1, count - 2].slice(0, plan.baskets)) {
      const plant = free.filter((each) => each.look === 'flower').sort((a, b) => Math.abs(a.id - wanted) - Math.abs(b.id - wanted) || a.id - b.id)[0];
      if (!plant) break;
      Object.assign(plant, { hanging: true, y: BASKET_Y });
      free.splice(free.indexOf(plant), 1);
    }
    this.snails = [];
    for (let n = 0; n < plan.snails; n += 1) {
      const plant = free.find((each) => each.look === 'flower' && !each.hanging);
      if (!plant) break;
      free.splice(free.indexOf(plant), 1);
      this.snails.push({ id: n, plant, splash: 0, off: false });
    }
    const between = (a, b) => (this.plants[a].x + this.plants[b].x) / 2;
    // The hedgehog and its bowl at one end, between the last two plants, and the bunny's hole at the other.
    this.hedgehog = plan.hedgehog && count > 1 ? { x: between(count - 2, count - 1), y: GROUND, bowl: 0, drank: false } : null;
    this.bunny = plan.bunny && count > 1 ? { x: between(0, 1), y: GROUND, up: false, timer: EXTRAS.bunnyDown * 0.5, splash: 0, gifts: 0, giggling: 0 } : null;
    // The sprinkler waits up on its post, and the cloud up in the sky, each over the garden, till the can touches them.
    this.sprinkler = plan.sprinkler ? { x: from + (to - from) * 0.25, y: 0.56, taken: false, left: EXTRAS.sprinklerSeconds } : null;
    this.cloud = plan.cloud ? { x: from + (to - from) * 0.8, y: 0.3, state: 'waiting', left: EXTRAS.cloudSeconds, way: -1 } : null;
  }

  /** The plants still to flower. */
  get thirsty() {
    return this.plants.filter((plant) => !plant.bloomed);
  }

  /** How tall a plant stands now, in screen heights, from a little shoot to its full height in flower. */
  heightOf(plant) {
    const share = clamp(plant.water / plant.need, 0, 1);
    const tall = plant.hanging ? TALL.hanging : TALL[plant.look];
    const shoot = Math.min(SEEDLING, tall * 0.6);
    return shoot + (tall - shoot) * share;
  }

  /** How near the can is to something, in screen heights. */
  near(can, thing) {
    return Math.hypot((can.x - thing.x) * this.aspect, can.y - thing.y);
  }

  /**
   * One frame of play. can is where the watering can is, or null when the hand can't be seen, and water where its
   * water comes out and how much, from 0 to 1, or null.
   */
  update(dt, { can = null, water = null } = {}) {
    if (this.done) {
      this.splash = null;
      return;
    }
    this.time += dt;
    if (this.wilted) {
      // A plant has wilted: a moment for it to be seen, and the garden is over.
      this.splash = null;
      this.wiltedFor += dt;
      if (this.wiltedFor >= DRYING.wiltedSeconds) this.done = true;
      return;
    }
    const flow = water ? clamp(water.flow, 0, 1) : 0;
    // A pour is the can tipped far enough for most of the water: counted each time, for the finish card.
    const pouring = flow >= 0.5;
    if (pouring && !this.pouring) this.stats.pours += 1;
    this.pourFor = pouring ? this.pourFor + dt : 0;
    this.stats.longest = Math.max(this.stats.longest, this.pourFor);
    this.pouring = pouring;
    if (can) this.touch(can);
    if (this.shared) this.askAgain();
    this.updateBunny(dt);
    this.updateCloud(dt);
    this.splash = null;
    if (flow > 0 && water) this.pour(water, flow, dt);
    if (!this.done && this.plants.every((plant) => plant.bloomed)) {
      this.done = true;
      this.onEvent({ type: 'all-bloomed' });
    }
    if (!this.done && this.drying && can) this.dry(dt);
  }

  /** The sun dries every plant not yet in flower, a little at a time, and one left too long wilts. */
  dry(dt) {
    for (const plant of this.thirsty) {
      plant.thirst = Math.min(1, plant.thirst + dt / this.plan.wilt);
      if (plant.thirst < 1) continue;
      this.wilted = plant;
      this.lost = true;
      this.onEvent({ type: 'wilted', plant });
      return;
    }
  }

  /** Water on a plant, whatever else it does, puts its thirst right, a little at a time. */
  freshen(plant, amount) {
    if (this.drying) plant.thirst = Math.max(0, plant.thirst - amount / DRYING.fresh);
  }

  /** The can coming near the sprinkler, or the cloud, takes it. */
  touch(can) {
    const { sprinkler, cloud } = this;
    if (sprinkler && !sprinkler.taken && this.near(can, sprinkler) < TOUCH) {
      sprinkler.taken = true;
      this.onEvent({ type: 'sprinkler', sprinkler });
    }
    if (cloud?.state === 'waiting' && this.near(can, cloud) < TOUCH * 1.3) {
      cloud.state = 'raining';
      cloud.way = cloud.x > 0.5 ? -1 : 1;
      this.onEvent({ type: 'cloud', cloud });
    }
  }

  /** How wide the can's water is now: wider with the sprinkler on, which runs down only while it pours. */
  streamWidth() {
    const { sprinkler } = this;
    return sprinkler?.taken && sprinkler.left > 0 ? SPRINKLED : STREAM;
  }

  /**
   * What water falling from (x, y), this wide either side, lands on. Whatever is highest under it is first, as a
   * basket hangs over the ground below it. Of things at about that height, the can's own water lands on what's
   * nearest across, and the sprinkler's on all of them. A snail or the bunny takes the water for its plant or hole.
   */
  landing(x, y, wide) {
    const hits = [];
    const across = (thing) => Math.abs(thing.x - x) <= REACH + wide;
    for (const plant of this.plants) {
      // A plant catches the water anywhere from its top down, so the can can be beside a tall one. A basket in
      // flower still catches it, so the ground under it stays dry.
      if ((plant.bloomed && !plant.hanging) || !across(plant) || plant.y <= y) continue;
      // Beside a tall one, the water falls a little way first, onto its leaves.
      const top = plant.y - this.heightOf(plant);
      hits.push({ thing: plant, kind: plant.bloomed ? 'basket' : 'plant', y: Math.max(top, Math.min(plant.y, y + 0.05)) });
    }
    const { hedgehog, bunny } = this;
    if (hedgehog && !hedgehog.drank && across(hedgehog) && hedgehog.y > y) hits.push({ thing: hedgehog, kind: 'bowl', y: hedgehog.y - 0.02 });
    if (bunny?.up && across(bunny) && bunny.y > y) hits.push({ thing: bunny, kind: 'bunny', y: bunny.y - 0.08 });
    if (!hits.length) return [{ thing: null, kind: 'ground', y: GROUND }];
    const first = Math.min(...hits.map((hit) => hit.y));
    const level = hits.filter((hit) => hit.y <= first + 0.12);
    if (wide > STREAM) return level;
    const nearest = Math.min(...level.map((hit) => Math.abs(hit.thing.x - x)));
    return level.filter((hit) => Math.abs(hit.thing.x - x) <= nearest + 0.005);
  }

  pour(water, flow, dt) {
    const wide = this.streamWidth();
    const hits = this.landing(water.x, water.y, wide);
    // Where it lands, and what on, for the drops on the screen to fall onto it.
    this.splash = { x: water.x, y: Math.min(...hits.map((hit) => hit.y)), wide, flow, to: hits[0].thing?.x ?? water.x };
    this.stats.poured += flow * dt;
    if (this.sprinkler?.taken && this.sprinkler.left > 0) {
      this.sprinkler.left = Math.max(0, this.sprinkler.left - dt);
      if (this.sprinkler.left === 0) this.onEvent({ type: 'sprinkler-done' });
    }
    for (const hit of hits) this.wet(hit, flow * dt);
  }

  /** Water on something: a plant grows, a snail slides off, the bowl fills, the bunny giggles. */
  wet(hit, amount) {
    const { thing, kind } = hit;
    if (kind === 'plant') {
      this.freshen(thing, amount);
      const snail = this.snails.find((each) => each.plant === thing && !each.off);
      if (snail) {
        snail.splash += amount;
        if (snail.splash >= EXTRAS.snailSplash) {
          snail.off = true;
          this.stats.snails += 1;
          this.onEvent({ type: 'snail-off', snail });
        }
        return;
      }
      this.grow(thing, amount);
    } else if (kind === 'bowl') {
      thing.bowl = Math.min(EXTRAS.bowlNeeds, thing.bowl + amount);
      if (thing.bowl >= EXTRAS.bowlNeeds) {
        thing.drank = true;
        this.prize('apple', thing);
        this.onEvent({ type: 'hedgehog', hedgehog: thing });
      }
    } else if (kind === 'bunny') {
      thing.splash += amount;
      if (thing.splash >= EXTRAS.bunnySplash) {
        thing.splash = 0;
        thing.up = false;
        thing.giggling = 1;
        thing.timer = EXTRAS.bunnyDown;
        if (thing.gifts < EXTRAS.bunnyGifts) {
          thing.gifts += 1;
          this.prize('carrot', thing);
        }
        this.onEvent({ type: 'bunny-giggle', bunny: thing });
      }
    }
  }

  grow(plant, amount) {
    if (plant.bloomed) return;
    if (this.shared) this.sip(plant, amount);
    else this.water(plant, plant.water + amount);
  }

  /** How much water a plant has had: its stages as it grows, and its flower once it's had enough. */
  water(plant, amount) {
    if (plant.bloomed) return;
    plant.water = Math.min(plant.need, amount);
    const stage = Math.min(STAGES, Math.floor((plant.water / plant.need) * STAGES));
    if (stage > plant.stage && plant.water < plant.need) {
      plant.stage = stage;
      this.onEvent({ type: 'grow', plant, stage });
    }
    if (plant.water >= plant.need) {
      plant.bloomed = true;
      plant.stage = STAGES;
      this.stats.flowers += 1;
      this.onEvent({ type: 'bloom', plant });
      if (this.plan.bees) {
        this.prize('honey', plant);
        this.onEvent({ type: 'bee', plant });
      }
      if (plant.look === 'bean') this.prize('egg', { x: plant.x, y: plant.y - this.heightOf(plant) });
    }
  }

  /** With friends: water on a plant is claimed a sip at a time, each the first sip of it nobody has yet. */
  sip(plant, amount) {
    plant.pending += amount;
    while (plant.pending >= SIP) {
      plant.pending -= SIP;
      const asking = new Set([...plant.asked.keys()].map((k) => k % 100));
      let sip = 0;
      while (plant.sips.has(sip) || asking.has(sip)) sip += 1;
      if (sip >= 100) return;
      const k = plant.id * 100 + sip;
      plant.asked.set(k, this.time);
      this.shared.claim(k);
    }
  }

  /**
   * With friends: the server says whose sip k is, the first to claim it. It's theirs on every computer, and the plant
   * grows by it. One this game claimed that went to someone else is water still to give, claimed again as another.
   */
  claimed(k, by) {
    const plant = this.plants[Math.floor(k / 100)];
    if (!plant || !Number.isInteger(k)) return;
    const sip = k % 100;
    if (plant.asked.delete(k) && by !== this.me) plant.pending += SIP;
    if (plant.sips.has(sip)) return;
    plant.sips.set(sip, by);
    this.tally.set(by, (this.tally.get(by) ?? 0) + 1);
    this.onEvent({ type: 'sip', plant, by, mine: by === this.me });
    this.water(plant, plant.sips.size * SIP);
    if (!this.done && this.plants.every((each) => each.bloomed)) {
      this.done = true;
      this.onEvent({ type: 'all-bloomed' });
    }
  }

  /** A sip claimed a while ago with no answer is given up, and its water claimed again. */
  askAgain() {
    for (const plant of this.plants) {
      for (const [k, at] of plant.asked) {
        if (this.time - at < ASK_AGAIN_SECONDS) continue;
        plant.asked.delete(k);
        plant.pending += SIP;
      }
    }
  }

  prize(kind, at) {
    this.stats.prizes[kind] += 1;
    this.onEvent({ type: 'prize', kind, at: { x: at.x, y: at.y } });
  }

  /** The bunny pops up now and then, and goes down again, only while the game is played. */
  updateBunny(dt) {
    const { bunny } = this;
    if (!bunny) return;
    bunny.giggling = Math.max(0, bunny.giggling - dt);
    bunny.timer -= dt;
    if (bunny.timer > 0) return;
    bunny.up = !bunny.up;
    bunny.splash = 0;
    bunny.timer = bunny.up ? EXTRAS.bunnyUp : EXTRAS.bunnyDown;
    if (bunny.up) this.onEvent({ type: 'bunny-up', bunny });
  }

  /** The rain cloud, once the can has touched it, drifts across the garden, raining on whatever is under it. */
  updateCloud(dt) {
    const { cloud } = this;
    if (cloud?.state !== 'raining') return;
    cloud.left -= dt;
    cloud.x = clamp(cloud.x + cloud.way * EXTRAS.cloudSpeed * dt, 0.05, 0.95);
    if (cloud.x <= 0.05 || cloud.x >= 0.95) cloud.way = -cloud.way;
    for (const hit of this.landing(cloud.x, cloud.y + 0.05, EXTRAS.cloudRain)) this.wet(hit, dt);
    if (cloud.left <= 0) {
      cloud.state = 'gone';
      this.onEvent({ type: 'cloud-done', cloud });
    }
  }

  /** The thirsty plant nearest a place across, for the tests and the films, which lead the can to it as a child would. */
  nextPlant(x = 0.5) {
    const left = this.thirsty;
    if (!left.length) return null;
    return left.slice().sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
  }

  /**
   * Where the can's water should come out to water a plant: just above it, or above its basket, which is up high. A
   * tall one catches water from beside it too, so the can needn't go above its top.
   */
  aimFor(plant) {
    const top = plant.y - this.heightOf(plant);
    return { x: plant.x, y: plant.hanging ? top - 0.08 : Math.max(0.45, top - 0.12) };
  }
}
