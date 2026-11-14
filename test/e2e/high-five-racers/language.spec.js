// Georgian: the same game, with its prompts spoken and shown in Georgian.
import {
  expect,
  openGame,
  reachRace,
  shot,
  show,
  test,
  waitForHand,
  waitForScreen,
  waitUntilMoving,
} from './helpers.js';

test('every Georgian line loads, and the prompts appear in Georgian', async ({ page }) => {
  await openGame(page, { language: 'ka', voice: true, sound: true });
  await show(page, null, 'open');
  await page.locator('#start').click();
  await waitForScreen(page, 'check');

  const loaded = await page.evaluate(async () => {
    const { sound } = window.__game;
    await sound.ready;
    return { language: sound.language, clips: [...sound.voiceClips.values()].map((clip) => clip.duration), expected: sound.lines.length };
  });
  expect(loaded.language).toBe('ka');
  expect(loaded.clips).toHaveLength(loaded.expected);
  for (const duration of loaded.clips) {
    expect(duration).toBeGreaterThan(0.2);
    expect(duration).toBeLessThan(7);
  }

  await expect(page.locator('#prompt')).toHaveText(/გაშალე ხელი/, { timeout: 20_000 });
  await shot(page, '95-georgian-hand-check');
  await waitForScreen(page, 'playing');
  await waitForHand(page, 'open');
  await waitUntilMoving(page);

  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  await expect(page.locator('#prompt')).toHaveText(/გაშალე მარჯვენა ხელი!/);
  await shot(page, '96-georgian-prompt');
});

test('Georgian letters use a font that has them', async ({ page }) => {
  await openGame(page, { language: 'ka' });
  const fonts = await page.evaluate(async () => {
    await document.fonts.load('700 40px "Noto Sans Georgian"', 'გაშალე');
    return [...document.fonts].filter((font) => font.status === 'loaded').map((font) => font.family.replace(/"/g, ''));
  });
  expect(fonts).toContain('Noto Sans Georgian');
  expect(fonts).toContain('Fredoka');
});

test('the longest Georgian line fits on screen, on a tablet too', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openGame(page, { language: 'ka' });
  const fits = await page.evaluate(() => {
    const prompt = document.getElementById('prompt');
    document.body.dataset.screen = 'racing';
    prompt.classList.add('is-visible');
    document.getElementById('prompt-text').textContent = 'კიდევ ერთხელ სცადე. გაშალე ხელი, რაც შეგიძლია ფართოდ!';
    const box = prompt.getBoundingClientRect();
    return { left: box.left, right: box.right, width: innerWidth, height: box.height };
  });
  expect(fits.left).toBeGreaterThanOrEqual(0);
  expect(fits.right).toBeLessThanOrEqual(fits.width);
  await shot(page, '97-georgian-longest-line');
});

test('switching language in the panel changes the voice and is remembered', async ({ page }) => {
  await openGame(page, { voice: true, sound: true });
  await show(page, null, 'open');
  await reachRace(page);
  await waitUntilMoving(page);

  const englishLength = await page.evaluate(() => window.__game.sound.voiceClips.get('Great job!').duration);

  await page.locator('#open-panel').click();
  await page.locator('input[name="language"][value="ka"]').check();
  await page.locator('#close-panel').click();
  await expect.poll(() => page.evaluate(() => window.__game.sound.linesLoaded)).toBe(true);
  const georgianLength = await page.evaluate(async () => {
    await window.__game.sound.ready;
    return window.__game.sound.voiceClips.get('Great job!').duration;
  });
  expect(georgianLength).not.toBe(englishLength);

  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  await expect(page.locator('#prompt')).toHaveText(/გაშალე მარჯვენა ხელი!/);

  await page.reload();
  await expect(page.locator('#start')).toBeVisible();
  expect(await page.evaluate(() => window.__game.sound.language)).toBe('ka');
});
