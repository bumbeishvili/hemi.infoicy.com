// Runs hand tracking off the main thread so the game keeps a steady frame rate.
// Camera frames arrive as ImageBitmaps and are closed as soon as they are read.
// Nothing here stores a frame or sends one anywhere.
import { HandLandmarker } from '../vendor/mediapipe/vision_bundle.mjs';
import { prepareToLoad, visionFiles } from './vision-files.js';

let landmarker = null;
let lastTimestamp = -1;

// detectForVideo requires strictly increasing timestamps.
function nextTimestamp(wanted) {
  lastTimestamp = Math.max(wanted, lastTimestamp + 1);
  return lastTimestamp;
}

async function createLandmarker() {
  const modelUrl = new URL('../vendor/mediapipe/hand_landmarker.task', import.meta.url).href;
  const fileset = await visionFiles();
  self.postMessage({ type: 'progress', share: 0.3 });

  let lastError = null;
  for (const delegate of ['GPU', 'CPU']) {
    try {
      prepareToLoad();
      landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        // Eager to find a hand: one held in an unusual posture or further from the camera
        // still has to be found. This only lets more candidates through to the next
        // check. Presence then confirms it is really a hand, and openness is measured
        // from the fingers after that, so a weak detection can't count as open.
        minHandDetectionConfidence: 0.2,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      self.postMessage({ type: 'progress', share: 0.7 });
      // The first detection compiles GPU programs, which took about 6 seconds on a
      // computer that had never run this before. Do it now, behind the loading screen,
      // so a child isn't told to show hands they are already showing.
      landmarker.detectForVideo(new ImageData(64, 64), nextTimestamp(0));
      return delegate;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

const toPoints = (landmarks) => landmarks.map(({ x, y, z }) => ({ x, y, z }));

function track(bitmap, timestamp) {
  const result = landmarker.detectForVideo(bitmap, nextTimestamp(timestamp));
  return result.landmarks.map((image, i) => ({
    image: toPoints(image),
    world: toPoints(result.worldLandmarks[i]),
    score: result.handedness[i]?.[0]?.score ?? 0,
    label: result.handedness[i]?.[0]?.categoryName ?? null,
  }));
}

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const delegate = await createLandmarker();
      self.postMessage({ type: 'ready', delegate });
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error?.message ?? error) });
    }
    return;
  }

  if (data.type === 'frame') {
    const { bitmap, timestamp, width, height } = data;
    try {
      const hands = track(bitmap, timestamp);
      self.postMessage({ type: 'result', hands, timestamp, aspect: width / height });
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error?.message ?? error) });
    } finally {
      bitmap.close();
    }
  }
};
