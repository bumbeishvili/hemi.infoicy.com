// Fights, with footage going through the real tracker. The coach shows one move at a time. Doing it
// makes a big move, and those are what win a round. Ordinary punches and kicks are small hits.
import { expect, screenName, shot, test, waitForScreen } from '../helpers.js';
import { RULES } from '../../../games/mighty-moves/moves.js';
import { askFor, coachState, doWhatIsAsked, fightState, fightUntilRoundEnds, footage, reachFight, standInView, stopDoingIt } from './helpers.js';

const FULL_HEALTH = RULES.maxHp;
const prompt = (page) => page.locator('#prompt');
const lostSoFar = async (page) => FULL_HEALTH - (await fightState(page)).npc.hp;

test('the coach shows what to do with the child\'s own character, and a real clap makes the move', async ({ page }) => {
  await reachFight(page);
  await expect(page.locator('#coach-text')).toHaveText('Clap your hands!', { timeout: 10_000 });
  await expect(page.locator('#coach-demo')).toBeVisible();
  const demo = await page.evaluate(() => {
    const { demo: shown, chosen } = window.__game.game;
    return { name: shown.playing.name, who: shown.spec.id, chosen: chosen.id };
  });
  expect(demo).toEqual({ name: 'clap', who: demo.chosen, chosen: demo.chosen });
  await page.waitForTimeout(700);
  await shot(page, 'm6-coach-asks');

  // It's really moving, rather than being a still picture.
  const hands = await page.evaluate(async () => {
    const { fighter } = window.__game.game.demo;
    const seen = [];
    for (let i = 0; i < 40; i += 1) {
      seen.push(fighter.upperL.quaternion.y);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return seen;
  });
  expect(Math.max(...hands) - Math.min(...hands)).toBeGreaterThan(0.05);

  await footage(page, 'claps', { from: 2.2 });
  await expect(page.locator('.callout.is-seen').first()).toContainText('You clapped!', { timeout: 15_000 });
  await expect(page.locator('.callout.is-big').first()).toContainText('Thunder Clap');
  await expect(page.locator('#camera-frame')).toHaveClass(/has-seen/);
  await page.waitForTimeout(150);
  await shot(page, 'm7-clap-seen');

  await expect.poll(() => lostSoFar(page)).toBeGreaterThan(10);
  expect((await fightState(page)).stats.exercises.clap).toBe(1);
  await expect(page.locator('.tally-item[data-exercise="clap"] .tally-count')).toHaveText('1');
  await expect(page.locator('#coach-text')).toHaveText('Squat down!', { timeout: 10_000 });
});

/** The child's fighter's pose, and the child's own as the camera reads it. */
const bodies = (page) => page.evaluate(() => {
  const { arena, reader } = window.__game;
  const pick = ({ handLY, handRY, hipDrop }) => ({ handLY, handRY, hipDrop });
  return { fighter: pick(arena.player.final), child: pick(reader.pose), copying: arena.player.copying };
});

test('the child\'s fighter copies them, whatever they do: arms up, arms down, or down in a squat', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFight(page);
  // Nothing from the computer meanwhile, and each still picture is given time for any move it made to finish.
  await page.evaluate(() => {
    window.__game.coach.computerIn = 1e9;
  });
  // Each still picture, until the fighter is doing the same: the tracker can take a moment to catch up.
  const holdStill = async (clip, from, same) => {
    await footage(page, clip, { from, playing: false });
    await expect.poll(async () => same(await bodies(page)), { timeout: 15_000 }).toBe(true);
    return bodies(page);
  };

  const up = await holdStill('star-jumps', 2.5, ({ copying, fighter }) => copying && Math.min(fighter.handLY, fighter.handRY) > 0.15);
  expect(up.copying).toBe(true);
  await shot(page, 'm-copy-arms-up');

  await holdStill('claps', 0, ({ fighter }) => Math.max(fighter.handLY, fighter.handRY) < -0.6);

  const squat = await holdStill('squat', 0, ({ child, fighter }) => child.hipDrop > 0.25 && fighter.hipDrop > 0.25);
  expect(squat.fighter.hipDrop).toBeGreaterThan(0.25);
  await shot(page, 'm-copy-squat');

  // Out of the picture, the fighter stands ready again.
  await page.evaluate(() => window.__camera.showNobody());
  await expect.poll(() => page.evaluate(() => window.__game.arena.player.copying), { timeout: 10_000 }).toBe(false);
});

test('real squats, jumps, star jumps and hand circles each make their own big move, when asked', async ({ page }) => {
  test.setTimeout(180_000);
  await reachFight(page, { fightStrength: 'gentle' });
  for (const [name, clip, from, seen, moveName] of [
    ['squat', 'squat', 0, 'You squatted!', 'Earthquake Stomp'],
    ['jump', 'jumps', 0, 'You jumped!', 'Flying Smash'],
    ['starJump', 'star-jumps', 0, 'What a star jump!', 'Star Burst'],
    ['handCircle', 'circles', 2, 'You made a circle!', 'Whirlwind'],
  ]) {
    await test.step(name, async () => {
      await standInView(page);
      await page.waitForTimeout(500);
      await askFor(page, name, name === 'handCircle' ? 'right' : null);
      const before = await fightState(page);
      await footage(page, clip, { from });
      await expect(page.locator('.callout.is-seen').first()).toContainText(seen, { timeout: 25_000 });
      await expect(page.locator('.callout.is-big').first()).toContainText(moveName);
      if (name === 'handCircle') await shot(page, 'm8-hand-circle');
      await expect.poll(async () => (await fightState(page)).npc.hp, { timeout: 5000 }).toBeLessThan(before.npc.hp - 10);
      expect((await fightState(page)).stats.exercises[name]).toBe(1);
    });
  }
});

test('a move on the wrong side doesn\'t count, and the same move on the right one does', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFight(page);
  await askFor(page, 'handCircle', 'right');
  await expect(page.locator('#coach-text')).toHaveText('Rotate your right hand in a big circle!');
  expect(await page.evaluate(() => window.__game.game.demo.playing.side)).toBe('right');
  await shot(page, 'm9-circle-asked');

  // In this clip the left hand goes round from nine seconds, and the right hand stays down.
  await footage(page, 'circles', { from: 9.2 });
  await page.waitForTimeout(6000);
  let state = await fightState(page);
  expect(state.stats.exercises.handCircle).toBe(0);
  expect((await coachState(page)).name).toBe('handCircle');

  // All that moving would otherwise count as having tried for long enough.
  await page.evaluate(() => {
    window.__game.coach.call.trying = 0;
  });
  await footage(page, 'circles', { from: 1.8 });
  await expect.poll(async () => (await fightState(page)).stats.exercises.handCircle, { timeout: 15_000 }).toBe(1);
  state = await fightState(page);
  // At least that one. An arm going round can land a small hit or two as well.
  expect(state.stats.strikes.right).toBeGreaterThanOrEqual(1);
});

test('real punches are small hits: they land, and do very little, and what was asked for still waits', async ({ page }) => {
  await reachFight(page);
  await askFor(page, 'squat');
  await footage(page, 'strikes', { from: 1.1 });
  await expect.poll(async () => {
    const { stats } = await fightState(page);
    return stats.strikes.left + stats.strikes.right;
  }, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(150);
  await shot(page, 'm10-small-hit');

  const state = await fightState(page);
  expect(FULL_HEALTH - state.npc.hp).toBeGreaterThan(0);
  expect(FULL_HEALTH - state.npc.hp).toBeLessThan(10);
  expect(state.stats.exercises.squat).toBe(0);
  expect(state.player.power).toBe(0);
  expect((await coachState(page)).name).toBe('squat');
  await expect(page.locator('#coach-text')).toHaveText('Squat down!');
  await expect(page.locator('.callout.is-big')).toHaveCount(0);
});

test('with only small hits a round can\'t be won, and it\'s made clear what would work', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFight(page, { fightStrength: 'gentle' });
  await page.evaluate(() => {
    const { fight, game } = window.__game;
    window.__coachNudges = 0;
    const real = game.onNudge.bind(game);
    game.onNudge = (event) => {
      window.__coachNudges += 1;
      real(event);
    };
    fight.player.smallHitsDealt = 24;
    window.__flailing = setInterval(() => {
      if (game.screen !== 'fight') return;
      if (game.coach.call) game.coach.call.trying = 0;
      game.onMoves([{ move: 'palm', side: 'right', hand: 'open' }]);
    }, 300);
  });
  await footage(page, 'strikes', { from: 1 });
  await expect.poll(() => page.evaluate(() => window.__coachNudges), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(3000);
  await page.evaluate(() => clearInterval(window.__flailing));
  const state = await fightState(page);
  expect(state.npc.hp).toBeGreaterThanOrEqual(FULL_HEALTH - RULES.smallHitsMost);
  expect(await screenName(page)).toBe('fight');
});

test('a push has to be with an open hand: a fist is a small hit, and is asked to open', async ({ page }) => {
  await reachFight(page);
  await askFor(page, 'push', 'right');
  await expect(page.locator('#coach-text')).toHaveText('Push your open right hand forward!');
  await page.evaluate(() => {
    window.__game.reader.hands.stateOf = () => 'closed';
  });
  await footage(page, 'strikes', { from: 1.8 });
  await expect(prompt(page)).toContainText('Open your right hand!', { timeout: 15_000 });
  await shot(page, 'm11-open-your-hand');
  expect((await fightState(page)).stats.exercises.push).toBe(0);
  expect((await coachState(page)).name).toBe('push');

  await page.evaluate(() => {
    window.__game.reader.hands.stateOf = () => 'open';
  });
  await footage(page, 'strikes', { from: 1.8 });
  await expect.poll(async () => (await fightState(page)).stats.exercises.push, { timeout: 15_000 }).toBe(1);
  await expect(page.locator('.callout.is-open').first()).toContainText('Open hand!');
});

test('the computer warns, shows how to block, and hits hard if it isn\'t blocked', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFight(page, { fightStrength: 'medium' });
  await footage(page, 'strikes', { from: 1 });
  await page.evaluate(() => {
    const { reader, coach } = window.__game;
    // The person in this clip keeps their hands up, which would be a block.
    reader.readGuardAndLean = () => {
      reader.guard = false;
    };
    coach.computerIn = 0;
    window.__moving = setInterval(() => window.__game.fight.noteActivity(0), 100);
  });
  await expect(page.locator('#coach-text')).toHaveText('Hands up! Block!', { timeout: 10_000 });
  expect(await page.evaluate(() => window.__game.game.demo.playing.name)).toBe('block');
  expect(await page.evaluate(() => window.__game.arena.warningMark.visible)).toBe(true);
  await shot(page, 'm12-block-asked');
  await expect.poll(async () => (await fightState(page)).player.hp, { timeout: 15_000 }).toBeLessThan(FULL_HEALTH - 10);
  await page.evaluate(() => clearInterval(window.__moving));
  // And back to what was being asked for.
  await expect(page.locator('#coach-text')).toHaveText('Clap your hands!', { timeout: 10_000 });
});

test('hands up when the coach says so stops the computer\'s hit', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFight(page, { fightStrength: 'tough' });
  await page.evaluate(() => {
    const { reader, coach } = window.__game;
    reader.readGuardAndLean = () => {
      reader.guard = true;
    };
    coach.computerIn = 0;
    window.__moving = setInterval(() => window.__game.fight.noteActivity(0), 100);
  });
  await expect(page.locator('.callout.is-seen').first()).toContainText('You blocked!', { timeout: 15_000 });
  await page.waitForTimeout(800);
  await shot(page, 'm13-blocked');
  await page.evaluate(() => clearInterval(window.__moving));
  expect((await fightState(page)).player.hp).toBe(FULL_HEALTH);
});

test('a whole fight: rounds, a breather, the win, the numbers, and the camera going off', async ({ page }) => {
  test.setTimeout(420_000);
  await reachFight(page);

  await fightUntilRoundEnds(page);
  expect(await screenName(page)).toBe('roundend');
  await page.waitForTimeout(600);
  await shot(page, 'm14-knockout');
  let state = await fightState(page);
  expect(state.npc.hp).toBe(0);
  expect(state.player.roundsWon).toBe(1);

  await waitForScreen(page, 'break');
  await expect(page.locator('#break-title')).toHaveText('That round is yours!');
  await expect(page.locator('.break-tally .tally-card')).toHaveCount(11);
  await shot(page, 'm15-break');

  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'fight');
  state = await fightState(page);
  expect(state.round).toBe(2);
  expect(state.npc.hp).toBe(FULL_HEALTH);

  await fightUntilRoundEnds(page);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('You win!');
  await expect(page.locator('#finish-line')).toContainText('won 2 of 2 rounds');
  await expect(page.locator('.finish-tally .tally-card')).toHaveCount(11);
  await expect(page.locator('.finish-tally .tally-card[data-exercise="clap"] strong')).not.toHaveText('0');
  await expect(page.locator('#finish-hands')).not.toBeEmpty();
  await page.waitForTimeout(900);
  await shot(page, 'm16-finish');

  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(0);

  await standInView(page);
  await page.locator('#fight-again').click();
  await waitForScreen(page, 'bodycheck');
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(1);
  await waitForScreen(page, 'fight');
  state = await fightState(page);
  expect(state.round).toBe(1);
  expect(state.stats.exercises.clap).toBe(0);

  await page.locator('#open-panel').click();
  await page.locator('#close-panel').click();
});

test('choosing another fighter after a fight goes back to the choosing screen', async ({ page }) => {
  test.setTimeout(240_000);
  await reachFight(page, { rounds: 1 });
  await fightUntilRoundEnds(page);
  await waitForScreen(page, 'finish');
  await page.locator('#other-fighter').click();
  await waitForScreen(page, 'choose');
  await expect(page.locator('.fighter-card[aria-checked="true"]')).toHaveCount(1);
  await page.locator('.fighter-card[data-fighter="tur"]').click();
  expect(await page.evaluate(() => window.__game.arena.player.spec.id)).toBe('tur');
  expect(await page.evaluate(() => window.__game.game.demo.spec.id)).toBe('tur');
  expect(await page.evaluate(() => window.__game.arena.npc)).toBe(null);
});

test('stepping out of the picture pauses everything, so nobody loses by walking away', async ({ page }) => {
  await reachFight(page, { fightStrength: 'tough' });
  await footage(page, 'strikes', { from: 1 });
  await page.waitForTimeout(1200);

  await page.evaluate(() => window.__camera.showNobody());
  await expect(prompt(page)).toContainText('Come back where I can see you', { timeout: 15_000 });
  await shot(page, 'm17-come-back');
  const stopped = await fightState(page);
  await page.waitForTimeout(3000);
  const later = await fightState(page);
  expect(later.time).toBe(stopped.time);
  expect(later.player.hp).toBe(stopped.player.hp);

  await standInView(page);
  await expect(prompt(page)).not.toContainText('Come back where I can see you', { timeout: 15_000 });
  await expect.poll(async () => (await fightState(page)).time, { timeout: 8000 }).toBeGreaterThan(later.time);
});

test('standing still is resting: the computer waits and waves, even at its toughest', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFight(page, { fightStrength: 'tough' });
  await standInView(page);
  await expect.poll(async () => (await fightState(page)).resting, { timeout: 30_000 }).toBe(true);
  await page.waitForTimeout(500);
  await shot(page, 'm18-resting');
  const before = await fightState(page);
  await page.waitForTimeout(9000);
  const after = await fightState(page);
  expect(after.player.hp).toBe(before.player.hp);
  expect(after.player.hp).toBe(FULL_HEALTH);
  expect(await page.evaluate(() => window.__game.arena.npc.held)).toBe('wave');
  expect((await coachState(page)).phase).toBe('asking');

  // Moving again gets the fight going.
  await footage(page, 'strikes', { from: 1 });
  await expect.poll(async () => (await fightState(page)).resting, { timeout: 8000 }).toBe(false);
  expect(await page.evaluate(() => window.__game.arena.npc.held)).toBe(null);
});

test('the grown-ups\' panel pauses the fight and remembers what it\'s told', async ({ page }) => {
  await reachFight(page);
  await page.locator('#open-panel').click();
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('#live-reading')).toContainText('The camera sees');
  await shot(page, 'm19-panel');
  const paused = await fightState(page);
  await page.waitForTimeout(600);
  expect((await fightState(page)).time).toBe(paused.time);

  await page.locator('input[name="moveSize"][value="small"]').check();
  await page.locator('input[name="hands"][value="left"]').check();
  await page.locator('input[name="jumps"][value="no"]').check();
  await page.locator('input[name="fightStrength"][value="tough"]').check();
  await page.locator('input[name="rounds"][value="1"]').check();
  // With a friend: together unless a grown-up says otherwise.
  await expect(page.locator('input[name="fightFriends"][value="together"]')).toBeChecked();
  await page.locator('input[name="fightFriends"][value="against"]').check();
  await page.locator('#close-panel').click();
  await expect.poll(async () => (await fightState(page)).time).toBeGreaterThan(paused.time);

  expect(await page.evaluate(() => {
    const { reader, fight, coach } = window.__game;
    return [reader.sizeName, fight.focusSide, coach.side, coach.allowJumps];
  })).toEqual(['small', 'left', 'left', false]);

  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
  await page.locator('#open-panel').click();
  for (const [name, value] of [['moveSize', 'small'], ['hands', 'left'], ['jumps', 'no'], ['fightStrength', 'tough'], ['rounds', '1'], ['fightFriends', 'against']]) {
    await expect(page.locator(`input[name="${name}"][value="${value}"]`)).toBeChecked();
  }
  const stored = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('camera-games-settings'))).sort());
  expect(stored).toEqual(['fightFriends', 'fightStrength', 'fighter', 'hands', 'jumps', 'language', 'moveSize', 'rounds', 'sound', 'strictness', 'voice']);
});

test('fighters at either end of the mat stay on the mat, and every fighter can fight and show every move', async ({ page }) => {
  await reachFight(page);
  await stopDoingIt(page);
  const fighters = await page.evaluate(async () => {
    const { ROSTER } = await import('/core/body/roster.js');
    return ROSTER.map(({ id }) => id);
  });
  expect(fighters).toHaveLength(10);
  for (const id of fighters) {
    await page.evaluate(async (which) => {
      const { arena, game } = window.__game;
      const { byId } = await import('/core/body/roster.js');
      const { DEMOS } = await import('/core/body/demos.js');
      arena.setFighter('npc', byId(which));
      for (const move of ['palm', 'punch', 'kick', 'flying', 'stomp', 'starBurst', 'turbo', 'sweep', 'skyCharge', 'uppercut', 'chop', 'knee', 'thunderClap', 'whirlwind']) {
        arena.moveStarted('npc', move, { side: 'left' });
        for (let i = 0; i < 12; i += 1) arena.update(0.05);
      }
      game.demo.setCharacter(byId(which));
      for (const name of Object.keys(DEMOS)) {
        for (const side of ['left', 'right']) {
          game.demo.show(name, side);
          for (let i = 0; i < 6; i += 1) game.demo.update(0.2);
        }
      }
      game.demo.hide();
    }, id);
    const position = await page.evaluate(() => window.__game.arena.npc.body.root.position.x);
    expect(Math.abs(position)).toBeLessThan(5);
  }
});

test('a fight can be played by doing as the coach says, at every level of the computer', async ({ page }) => {
  test.setTimeout(240_000);
  await reachFight(page, { fightStrength: 'medium', rounds: 1 });
  await doWhatIsAsked(page);
  await waitForScreen(page, 'finish');
  await stopDoingIt(page);
  await expect(page.locator('#finish-title')).toHaveText('You win!');
});
