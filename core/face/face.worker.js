// Runs face tracking off the main thread, in the same way hand tracking does, so a game keeps a steady frame
// rate. Camera frames arrive as ImageBitmaps and are closed as soon as they are read. Nothing here stores a
// frame or sends one anywhere: what goes back is only where the points of the face are.
//
// Each face comes back as { points }, 478 points as x, y, z, x, y, z... in one list of numbers: x and y from 0 to
// 1 across and down the picture, and z how far towards the camera, on the same scale as x. What they mean, and
// how the mouth is read from them, is in mouth.js.
import { FaceLandmarker } from '../../vendor/mediapipe/vision_bundle.mjs';
import { prepareToLoad, visionFiles } from '../vision-files.js';

let landmarker = null;
let lastTimestamp = -1;
// A child may be on a grown-up's lap, or have someone beside them: mouth.js follows one face of these.
const MOST_FACES = 2;

// The face model has a part that always runs on the CPU, even on the GPU, and the engine says so with
// "INFO: Created TensorFlow Lite XNNPACK delegate for CPU." written as an error. It's only a note, so it's kept
// as one; anything else written as an error is still an error.
const logError = console.error.bind(console);
console.error = (...args) => (typeof args[0] === 'string' && args[0].startsWith('INFO: ') ? console.info(...args) : logError(...args));

// detectForVideo requires strictly increasing timestamps.
function nextTimestamp(wanted) {
  lastTimestamp = Math.max(wanted, lastTimestamp + 1);
  return lastTimestamp;
}

async function createLandmarker() {
  const modelUrl = new URL('../../vendor/mediapipe/face_landmarker.task', import.meta.url).href;
  const fileset = await visionFiles();
  self.postMessage({ type: 'progress', share: 0.3 });

  let lastError = null;
  for (const delegate of ['GPU', 'CPU']) {
    try {
      prepareToLoad();
      landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: 'VIDEO',
        numFaces: MOST_FACES,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      self.postMessage({ type: 'progress', share: 0.7 });
      // The first detection compiles GPU programs, so that happens behind the loading screen.
      landmarker.detectForVideo(new ImageData(64, 64), nextTimestamp(0));
      return delegate;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function toPoints(landmarks) {
  const points = new Float32Array(landmarks.length * 3);
  landmarks.forEach(({ x, y, z }, index) => {
    points[index * 3] = x;
    points[index * 3 + 1] = y;
    points[index * 3 + 2] = z;
  });
  return points;
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
      const found = landmarker.detectForVideo(bitmap, nextTimestamp(timestamp));
      const faces = found.faceLandmarks.map((landmarks) => ({ points: toPoints(landmarks) }));
      self.postMessage({ type: 'result', faces, timestamp, aspect: width / height }, faces.map((face) => face.points.buffer));
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error?.message ?? error) });
    } finally {
      bitmap.close();
    }
  }
};
