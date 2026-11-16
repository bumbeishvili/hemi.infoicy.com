// Runs whole-body tracking off the main thread, in the same way hand tracking does. Frames
// arrive as ImageBitmaps and are closed as soon as they are read. Nothing here stores a frame
// or sends one anywhere.
//
// Hands are far too small to read in a picture of a whole body, so a game can also send a
// close-up of the area around a wrist, which goes through the hand model.
//
// It looks for one person, unless a game says how many are playing in front of this camera: then it looks for
// that many, and reports all it finds. Which of them is which player is worked out in core/body/people.js.
import { HandLandmarker, PoseLandmarker } from '../../vendor/mediapipe/vision_bundle.mjs';
import { prepareToLoad, visionFiles } from '../vision-files.js';

let pose = null;
let hand = null;
let lastTimestamp = -1;
const MOST_PEOPLE = 4;
let people = 1; // How many bodies to look for.
let changing = Promise.resolve(); // A change to that, which a frame waits for.
const peopleFrom = (count) => Math.min(MOST_PEOPLE, Math.max(1, Math.round(Number(count)) || 1));

const nextTimestamp = (wanted) => {
  lastTimestamp = Math.max(wanted, lastTimestamp + 1);
  return lastTimestamp;
};

async function createLandmarkers() {
  const fileset = await visionFiles();
  self.postMessage({ type: 'progress', share: 0.2 });
  const poseModel = new URL('../../vendor/mediapipe/pose_landmarker_full.task', import.meta.url).href;
  const handModel = new URL('../../vendor/mediapipe/hand_landmarker.task', import.meta.url).href;

  let lastError = null;
  for (const delegate of ['GPU', 'CPU']) {
    try {
      prepareToLoad();
      pose = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: poseModel, delegate },
        runningMode: 'VIDEO',
        numPoses: people,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      self.postMessage({ type: 'progress', share: 0.5 });
      prepareToLoad();
      hand = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: handModel, delegate },
        runningMode: 'IMAGE',
        numHands: 1,
        minHandDetectionConfidence: 0.3,
        minHandPresenceConfidence: 0.4,
      });
      self.postMessage({ type: 'progress', share: 0.75 });
      // The first detection compiles GPU programs, so that happens behind the loading screen.
      pose.detectForVideo(new ImageData(64, 64), nextTimestamp(0));
      hand.detect(new ImageData(64, 64));
      return delegate;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

const toPoints = (landmarks) => landmarks.map(({ x, y, z, visibility }) => ({ x, y, z, visibility }));

function readHand({ side, bitmap, box }) {
  const found = hand.detect(bitmap);
  if (!found.landmarks.length) return { side, box, found: false };
  return {
    side,
    box,
    found: true,
    image: toPoints(found.landmarks[0]),
    world: toPoints(found.worldLandmarks[0]),
    score: found.handedness[0]?.[0]?.score ?? 0,
    label: found.handedness[0]?.[0]?.categoryName ?? null,
  };
}

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    people = peopleFrom(data.people);
    try {
      const delegate = await createLandmarkers();
      self.postMessage({ type: 'ready', delegate });
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error?.message ?? error) });
    }
    return;
  }

  // A game has said how many are playing in front of this camera.
  if (data.type === 'people') {
    const count = peopleFrom(data.count);
    if (count === people || !pose) {
      people = count;
      return;
    }
    people = count;
    changing = changing.then(() => pose.setOptions({ numPoses: count })).catch((error) => {
      self.postMessage({ type: 'error', message: String(error?.message ?? error) });
    });
    return;
  }

  if (data.type === 'frame') {
    const { bitmap, timestamp, width, height, closeUps = [] } = data;
    try {
      await changing;
      const found = pose.detectForVideo(bitmap, nextTimestamp(timestamp));
      // Everyone it found, in no particular order, and the first of them for a game with one player.
      const bodies = found.landmarks.map((landmarks, index) => ({ image: toPoints(landmarks), world: toPoints(found.worldLandmarks[index]) }));
      const body = bodies[0] ?? null;
      const hands = closeUps.map(readHand);
      self.postMessage({ type: 'result', body, bodies, hands, timestamp, aspect: width / height });
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error?.message ?? error) });
    } finally {
      bitmap.close();
      for (const closeUp of closeUps) closeUp.bitmap.close();
    }
  }
};
