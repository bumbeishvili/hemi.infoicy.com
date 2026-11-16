// The character on the path: one of the roster (core/body/roster.js), drawn once from its 3D model into flat
// pictures, seen from the side, as the path is. It walks to the right, turned a little towards the child, standing
// and in two steps of a walk, and there's a picture for each thing it does: in the air, ducked down, reaching up,
// a star jump, sitting after a tumble, and a cheer. The game is 2D, and shows these pictures.
import * as THREE from '../../vendor/three/three.module.js';
import { Fighter3D, makePose } from '../../core/body/characters.js';

const LOOK_DOWN = 0.14; // How far the view looks down on the character, in radians: nearly level, as the path is.
const BODY = 2.05; // About how tall a character is, without a long neck.
const WIDE = 2.7; // How wide each picture is, in the character's own units: room for arms out in a star.
const SIDE = Math.PI / 2 - 0.5; // Walking to the right, turned a little towards the child.
const FRONT = 0;

const REST = makePose();
const pose = (changes) => ({ ...REST, ...changes });
const walk = (lead, bounce) => pose({
  up: bounce,
  pitch: 0.08,
  footLZ: lead,
  footRZ: -lead,
  footLY: lead < 0 ? 0.16 : 0.02,
  footRY: lead > 0 ? 0.16 : 0.02,
  handLX: 0.4,
  handLY: -0.8,
  handLZ: -lead * 1.1,
  handRX: -0.4,
  handRY: -0.8,
  handRZ: lead * 1.1,
});

// Each picture: how the character stands in it, its face, and which way it's turned.
export const POSES = {
  stand: { pose: pose({ handLX: 0.38, handLY: -0.84, handRX: -0.38, handRY: -0.84 }), face: 'ready', facing: SIDE },
  stepA: { pose: walk(0.3, 0.05), face: 'ready', facing: SIDE },
  stepB: { pose: walk(-0.3, 0.05), face: 'ready', facing: SIDE },
  // In the air: knees up, arms up, looking where it's going.
  hop: { pose: pose({ pitch: 0.12, footLY: 0.3, footRY: 0.2, footLZ: 0.22, footRZ: -0.16, handLX: 0.46, handLY: 0.62, handLZ: 0.25, handRX: -0.46, handRY: 0.62, handRZ: 0.25, headPitch: -0.12 }), face: 'happy', facing: SIDE },
  // Knees bent and body low, to go under something.
  duck: { pose: pose({ hipDrop: 0.46, pitch: 0.5, headPitch: -0.3, handLX: 0.4, handLY: -0.5, handLZ: 0.34, handRX: -0.4, handRY: -0.5, handRZ: 0.34 }), face: 'ready', facing: SIDE },
  // Both arms up high, on tiptoe, for the apples.
  reach: { pose: pose({ up: 0.08, handLX: 0.26, handLY: 0.98, handLZ: 0.1, handRX: -0.26, handRY: 0.98, handRZ: 0.1, headPitch: -0.32 }), face: 'happy', facing: SIDE - 0.25 },
  // A star jump, arms and legs out, facing the child.
  star: { pose: pose({ handLX: 0.84, handLY: 0.62, handRX: -0.84, handRY: 0.62, footLX: 0.5, footRX: -0.5, footLY: 0.1, footRY: 0.1 }), face: 'happy', facing: FRONT },
  // Sat down with a bump.
  sit: { pose: pose({ hipDrop: 0.78, pitch: -0.22, footLZ: 0.5, footRZ: 0.5, footLY: 0.03, footRY: 0.03, handLX: 0.5, handLY: -0.6, handLZ: -0.3, handRX: -0.5, handRY: -0.6, handRZ: -0.3 }), face: 'dizzy', facing: SIDE },
  cheer: { pose: pose({ up: 0.16, handLX: 0.34, handLY: 0.92, handLZ: 0.12, handRX: -0.34, handRY: 0.92, handRZ: 0.12, headPitch: -0.12 }), face: 'happy', facing: FRONT },
};

/**
 * Draws a character in every picture. pixels is how many pixels tall its body is to be, without a long neck.
 * Returns { frames, width, height, foot, tall }: frames has one picture for each of POSES, foot is where the
 * character's feet are in each picture, and tall how many pixels high its body is there. Drawn once, when the
 * character is chosen, and then only copied.
 */
export function renderHiker(spec, pixels) {
  const each = pixels / BODY; // Pixels for each unit of the character's own size.
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#cdd7e2', 1.6));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.1);
  sun.position.set(-3, 8, 6);
  scene.add(sun);

  const tall = BODY + spec.build.neck;
  const up = Math.cos(LOOK_DOWN);
  const along = Math.sin(LOOK_DOWN);
  // The picture's edges, in the view's own units: room above the head for arms up, and a little under the feet.
  const [left, right, top, bottom] = [-WIDE / 2, WIDE / 2, (tall + 0.75) * up + 0.5 * along, -0.3];
  const width = Math.round((right - left) * each);
  const height = Math.round((top - bottom) * each);
  renderer.setSize(width, height, false);
  const camera = new THREE.OrthographicCamera(left, right, top, bottom, 0.1, 80);
  camera.position.set(0, along * 30, up * 30);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  const fighter = new Fighter3D(spec);
  fighter.blinkIn = 99;
  scene.add(fighter.root);
  const frames = {};
  for (const [name, { pose: body, face, facing }] of Object.entries(POSES)) {
    fighter.faceTowards(facing);
    fighter.setPose(body);
    fighter.setExpression(face);
    fighter.update(0.5);
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
    const image = document.createElement('canvas');
    image.width = width;
    image.height = height;
    image.getContext('2d').drawImage(canvas, 0, 0);
    frames[name] = image;
  }
  scene.remove(fighter.root);
  fighter.dispose();
  renderer.forceContextLoss();
  renderer.dispose();
  return {
    frames,
    width,
    height,
    foot: { x: width / 2, y: (top / (top - bottom)) * height },
    tall: BODY * up * each,
    colour: spec.colours.body,
  };
}
