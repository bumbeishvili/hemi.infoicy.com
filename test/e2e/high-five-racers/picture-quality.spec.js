// Real rooms aren't test photos. Whatever happens to the picture, a fist must never read
// as an open hand. A hand the tracker can't read just doesn't count, which is safe.
import {
  expect,
  hands,
  openGame,
  reachRace,
  shot,
  show,
  test,
  waitForHand,
  waitForScreen,
} from './helpers.js';

const CONDITIONS = [
  { name: 'turned 30 degrees', rotate: 30, shouldReadOpen: true },
  { name: 'turned -30 degrees', rotate: -30, shouldReadOpen: true },
  { name: 'turned 60 degrees', rotate: 60, shouldReadOpen: false },
  { name: 'turned -60 degrees', rotate: -60, shouldReadOpen: false },
  { name: 'dim room', brightness: 0.5, shouldReadOpen: true },
  { name: 'very dim room', brightness: 0.25, shouldReadOpen: false },
  { name: 'slight blur', blur: 2, shouldReadOpen: true },
  { name: 'heavy blur', blur: 6, shouldReadOpen: false },
  { name: 'closer', scale: 1.25, shouldReadOpen: true },
  { name: 'dim, blurred and turned', brightness: 0.45, blur: 3, rotate: 25, shouldReadOpen: false },
];

const SETTLE_MS = 1300;

test('a fist never reads as open, however poor the picture', async ({ page }) => {
  await openGame(page);
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');

  const rows = [];
  const fistProblems = [];
  const openProblems = [];

  for (const { name, shouldReadOpen, ...condition } of CONDITIONS) {
    // The hand leaves the picture first, so nothing carries over from the last scene. Any
    // "open" from here on is a fist genuinely being misread.
    await show(page, null, null);
    await waitForHand(page, 'missing');
    await show(page, null, 'fist', condition);

    // Sample all the way through: a brief false "open" would still move the car.
    let fistEverOpen = false;
    let fistPeak = 0;
    const end = Date.now() + SETTLE_MS;
    while (Date.now() < end) {
      const { right, drive } = await hands(page);
      if (right.status === 'open' || drive > 0) fistEverOpen = true;
      fistPeak = Math.max(fistPeak, right.status === 'missing' ? 0 : right.openness);
      await page.waitForTimeout(60);
    }
    const fist = await hands(page);

    await show(page, null, 'open', condition);
    await page.waitForTimeout(SETTLE_MS);
    const open = await hands(page);

    rows.push(`${name.padEnd(26)} fist ${fist.right.status} peak ${fistPeak.toFixed(2)}   open ${open.right.status} ${open.right.openness.toFixed(2)}`);
    if (fistEverOpen) fistProblems.push(name);
    if (shouldReadOpen && !open.handOpen) openProblems.push(name);
  }

  console.log(`\n${rows.join('\n')}`);
  expect(fistProblems, 'a fist read as open').toEqual([]);
  expect(openProblems, 'an open hand should still read as open here').toEqual([]);
});

test('a hand found up close keeps being read correctly as the child leans back', async ({ page }) => {
  await openGame(page);
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');

  // Far enough back that this hand could not have been found from here to begin with.
  for (const scale of [0.8, 0.6, 0.45, 0.35]) {
    await show(page, null, 'open', { scale });
    await page.waitForTimeout(700);
    expect((await hands(page)).handOpen, `open at ${scale}`).toBe(true);
  }

  // Closing the hand that far back must still stop the car. If the fist is lost rather than
  // read, it still doesn't count as open.
  await show(page, null, 'fist', { scale: 0.35 });
  await expect.poll(async () => (await hands(page)).right.status).not.toBe('open');
  expect((await hands(page)).drive).toBe(0);
});

test('a child too far back is told to come closer and shown how big the hand should look', async ({ page }) => {
  await openGame(page);
  await show(page, null, 'open', { scale: 0.42 });
  await page.locator('#start').click();
  await expect(page.locator('#prompt')).toHaveText(/Show your right hand!/, { timeout: 20_000 });
  await expect(page.locator('.hand-guide.is-wanted')).toHaveCount(1);
  await expect(page.locator('#prompt')).toHaveText(/closer to the camera/, { timeout: 15_000 });
  await shot(page, '80-come-closer');

  await show(page, null, 'open');
  await expect(page.locator('#prompt')).toHaveText(/Open your hand as wide as you can!/, { timeout: 20_000 });
  await expect(page.locator('.hand-guide.is-wanted')).toHaveCount(0);
  await shot(page, '81-found-after-coming-closer');
});

test('a hand the same size as the guide is found from cold', async ({ page }) => {
  await openGame(page);
  // Scale 0.85 puts the palm at about 0.2 of the frame height, the guide's size.
  await show(page, null, 'open', { scale: 0.85 });
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
});
