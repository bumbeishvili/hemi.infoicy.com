// Spoken prompts are how a child who can't read yet knows what to do, and nobody wants
// to be nagged. Also covers the message that makes resting feel fine.
import {
  expect,
  openGame,
  reachRace,
  shot,
  show,
  test,
  waitForHand,
  waitUntilMoving,
} from './helpers.js';

/** Records each line that actually starts playing. */
function listenToSpeech(page) {
  return page.evaluate(() => {
    const { sound } = window.__game;
    const say = sound.say.bind(sound);
    window.__spoken = [];
    sound.say = (...args) => {
      const playing = say(...args);
      if (playing) window.__spoken.push(args[0]);
      return playing;
    };
  });
}

const spoken = (page) => page.evaluate(() => window.__spoken);
const count = (lines, text) => lines.filter((line) => line === text).length;

test('prompts are spoken, repeated a few times at most, and resting is made fine', async ({ page }) => {
  await openGame(page, { voice: true, sound: true });
  await listenToSpeech(page);
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);

  expect(await spoken(page)).toContain('Open your hand as wide as you can!');
  expect(await spoken(page)).toContain('Great job!');

  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  await expect(page.locator('#prompt')).toHaveText(/Open your right hand!/);
  await expect.poll(async () => count(await spoken(page), 'Open your right hand!')).toBe(1);

  // Long enough for the repeat, with the left hand staying closed.
  await expect.poll(async () => count(await spoken(page), 'Open your right hand!'), { timeout: 12_000 }).toBe(2);

  await expect(page.locator('#prompt')).toHaveText(/Resting is OK/, { timeout: 20_000 });
  await expect.poll(async () => count(await spoken(page), 'Resting is OK. Open your hand when you’re ready.')).toBe(1);
  await shot(page, '60-resting-message');

  await show(page, null, 'open');
  await waitForHand(page, 'open');
  await expect(page.locator('#prompt')).not.toHaveText(/Resting/);
  await waitUntilMoving(page);
});

test('the countdown is spoken in order and "Great job!" gets to finish first', async ({ page }) => {
  await openGame(page, { voice: true, sound: true });
  await page.evaluate(() => {
    const { sound } = window.__game;
    const speak = sound.speak.bind(sound);
    window.__timeline = [];
    sound.speak = (text, clip, after = 0) => {
      window.__timeline.push({ text, at: performance.now() + after * 1000, length: clip.duration * 1000 });
      return speak(text, clip, after);
    };
  });
  await show(page, null, 'open');
  await reachRace(page);
  await waitUntilMoving(page);

  const timeline = await page.evaluate(() => window.__timeline);
  const from = timeline.findIndex(({ text }) => text === 'Great job!');
  expect(timeline.slice(from, from + 5).map(({ text }) => text)).toEqual(['Great job!', '3', '2', '1', 'Go!']);

  // Each of these has to finish before the next one starts.
  for (let i = from; i < from + 4; i += 1) {
    expect(timeline[i + 1].at, `${timeline[i].text} was cut off`).toBeGreaterThanOrEqual(timeline[i].at + timeline[i].length);
  }
  // A prompt straight after "Go!" waits for it instead of cutting it off.
  const go = timeline[from + 4];
  if (timeline[from + 5]) expect(timeline[from + 5].at).toBeGreaterThanOrEqual(go.at + go.length);
});

test('a prompt waits for the voice to finish, and a new one follows it', async ({ page }) => {
  await openGame(page, { voice: true, sound: true });
  await listenToSpeech(page);
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');

  await show(page, null, 'fist');
  await expect.poll(async () => count(await spoken(page), 'Open your right hand!')).toBe(1);
  const interrupted = await page.evaluate(() => window.__game.sound.say('Open your right hand!', { ifQuiet: true }));
  expect(interrupted).toBe(false);
});

/** On the title, where nothing else is going to speak. A click lets the page play sound. */
async function soundReady(page) {
  await openGame(page, { voice: true, sound: true });
  await page.locator('h1').click();
  await page.evaluate(async () => {
    const { sound } = window.__game;
    sound.unlock();
    await sound.ready;
    await sound.context.resume();
  });
}

test('a line is never cut off: the next one waits its turn, and only the newest waits', async ({ page }) => {
  await soundReady(page);
  const heard = await page.evaluate(async () => {
    const { sound } = window.__game;
    const said = [];
    let stops = 0;
    const realSpeak = sound.speak.bind(sound);
    sound.speak = (text, clip, after = 0) => {
      said.push({ text, at: performance.now() + after * 1000, length: clip.duration * 1000 });
      const started = realSpeak(text, clip, after);
      const { source } = sound.currentVoice;
      const realStop = source.stop.bind(source);
      source.stop = (...args) => {
        stops += 1;
        return realStop(...args);
      };
      return started;
    };
    const first = sound.say('One more try. Open your hand as wide as you can!');
    const second = sound.say('Great job!');
    const third = sound.say('Nice one!');
    const quiet = sound.say('Way to go!', { ifQuiet: true });
    const again = sound.say('One more try. Open your hand as wide as you can!');
    await new Promise((resolve) => setTimeout(resolve, 5500));
    return { first, second, third, quiet, again, said, stops };
  });
  expect([heard.first, heard.second, heard.third, heard.quiet, heard.again]).toEqual([true, true, true, false, true]);
  // The first in full, then only the newest of the ones that came while it was being said.
  expect(heard.said.map(({ text }) => text)).toEqual(['One more try. Open your hand as wide as you can!', 'Nice one!']);
  expect(heard.stops).toBe(0);
  const [one, two] = heard.said;
  expect(two.at).toBeGreaterThanOrEqual(one.at + one.length);
});

test('a line that has waited too long is out of date, and goes unsaid', async ({ page }) => {
  await soundReady(page);
  const said = await page.evaluate(async () => {
    const { sound } = window.__game;
    const lines = [];
    const realSpeak = sound.speak.bind(sound);
    sound.speak = (text, clip, after = 0) => {
      lines.push(text);
      return realSpeak(text, clip, after);
    };
    sound.say('One more try. Open your hand as wide as you can!');
    sound.say('Great job!');
    sound.waitingLine.at -= 10_000;
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return lines;
  });
  expect(said).toEqual(['One more try. Open your hand as wide as you can!']);
});

test('turning the voice off silences prompts', async ({ page }) => {
  await openGame(page, { voice: false, sound: false });
  await listenToSpeech(page);
  await show(page, null, 'fist');
  await reachRace(page);
  await expect(page.locator('#prompt')).toHaveText(/Open your right hand!/);
  expect(await spoken(page)).toEqual([]);
});
