// Replaces the webcam with a canvas showing real photos of hands. Everything after the
// camera is the real thing: the real tracker, the real model and the real game.
//
// Tests say what the child is doing in screen terms ("left hand on the left of the
// mirror"). The canvas is then flipped, because a webcam sends the unmirrored picture.
(() => {
  const WIDTH = 1280;
  const HEIGHT = 720;
  const PHOTO_HEIGHT = 430;
  const SLOT_X = { left: 330, right: 950 };
  // Which real hand each photo shows, which the tracker's label confirms. Flipped, a left
  // hand becomes a right hand, so a photo of either can stand in for both.
  // open is the back of a left hand, so flipped for the right hand it arrives as the back of a right hand. palm and
  // back are the same right hand from the front and from behind, for turning a hand over.
  const PHOTO_HAND = {
    open: 'left',
    relaxed: 'left',
    fist: 'right',
    pointing: 'right',
    victory: 'right',
    'thumbs-up': 'right',
    palm: 'right',
    back: 'right',
  };

  // Where the tracker finds the middle of the palm in each photo, from the middle of the photo, and how long it
  // finds the palm, in this picture's pixels with the photo PHOTO_HEIGHT tall, for a hand on the right of the
  // mirror. The photos are of different hands, held differently, so the palm is somewhere else in each, and a
  // different size. With sameHand, each is drawn with the middle of its palm where the hand is said to be, and
  // its palm as long as the open hand's: as one hand would look that opens, closes and makes shapes where it is.
  const PALM = {
    open: { x: -35.8, y: 57, size: 171 },
    fist: { x: 11.5, y: -41.5, size: 134.5 },
    victory: { x: 18.3, y: 25, size: 147.5 },
    pointing: { x: 43.6, y: 22.2, size: 118.5 },
    relaxed: { x: -15.1, y: -48.5, size: 273 },
    'thumbs-up': { x: 19.2, y: 45.4, size: 113 },
    palm: { x: 33.2, y: 11.6, size: 163.5 },
  };

  const photos = {};
  const loadPhoto = (name) => {
    if (photos[name]) return photos[name];
    const image = new Image();
    image.src = `/test/fixtures/photos/${name}.jpg`;
    photos[name] = image;
    return image;
  };

  const DEFAULTS = {
    leftOffsetY: 0,
    rightOffsetY: 0,
    rightOffsetX: 0,
    leftOffsetX: 0, // Together with rightOffsetX, these can put a hand on the wrong side.
    leftOnTop: false, // Which hand is in front, if they overlap.
    scale: 1,
    rotate: 0, // Degrees, each hand turned the same way as seen by the child.
    brightness: 1, // Below 1 is a dimmer room.
    blur: 0, // In pixels, for a moving hand or a poor camera.
    squeeze: 1, // Each hand's photo narrower across, as a hand turned part of the way to side-on looks.
    shorten: 1, // And shorter, as a hand tipped towards the camera looks, its wrist dropped.
    leftShorten: null, // One hand shorter than the other, for a game where each hand does its own: instead of shorten.
    rightShorten: null,
    sameHand: false, // Every photo drawn as the same hand in the same place: see PALM above.
  };
  const scene = { left: 'open', right: 'open', ...DEFAULTS };

  // For whole-body games: real footage of a person, which plays as if it were the camera.
  const footage = document.createElement('video');
  footage.muted = true;
  footage.loop = true;
  footage.playsInline = true;

  // For several playing in front of one camera: a clip for each of them, side by side.
  const people = [];
  async function clipFor(video, name, from, playing) {
    const source = `/test/fixtures/body/${name}.webm`;
    if (video.dataset.clip !== source) {
      const blob = await (await fetch(source)).blob();
      video.dataset.clip = source;
      video.src = URL.createObjectURL(blob);
      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = () => reject(new Error(`cannot load ${source}`));
      });
    }
    video.pause();
    await new Promise((resolve) => {
      video.onseeked = resolve;
      video.currentTime = from;
    });
    if (playing) await video.play();
  }

  window.__camera = {
    failWith: null,
    streams: 0,
    /**
     * Shows several people side by side, each a clip from test/fixtures/body: clips is a list of { name, from,
     * playing, at }, the first of them on the left of the screen, and null for a place with nobody in it. Each has
     * an equal share of the picture's width, cut from their clip around where its person stands: at, as a share
     * of the clip's width, which is the middle unless said.
     */
    async showPeople(clips) {
      footage.pause();
      scene.footage = false;
      for (const [index, clip] of clips.entries()) {
        people[index] ??= Object.assign(document.createElement('video'), { muted: true, loop: true, playsInline: true });
        if (clip) await clipFor(people[index], clip.name, clip.from ?? 0, clip.playing ?? true);
        else people[index].pause();
        people[index].dataset.there = clip ? 'yes' : 'no';
        people[index].dataset.at = String(clip?.at ?? 0.5);
      }
      scene.people = clips.length;
    },
    /** One of those people does something else, or steps out of the picture (clip null), and the others carry on. */
    async showPerson(index, clip) {
      if (clip) await clipFor(people[index], clip.name, clip.from ?? 0, clip.playing ?? true);
      else people[index].pause();
      people[index].dataset.there = clip ? 'yes' : 'no';
      if (clip?.at !== undefined) people[index].dataset.at = String(clip.at);
    },
    show(change) {
      scene.footage = false;
      scene.people = 0;
      Object.assign(scene, DEFAULTS, change);
    },
    /** Shows a clip from test/fixtures/body, from a moment in it, playing or held still. */
    /** Moves the footage that's playing across, without starting it again. See shiftX below. */
    shiftFootage(shiftX) {
      scene.footageShiftX = shiftX;
    },
    /**
     * Tips the footage over, about the person's feet, by so many degrees towards the right of the mirror: a
     * person standing still then looks like one leaning that far, all in a piece. 0 stands them up again.
     */
    tiltFootage(degrees) {
      scene.footageTilt = degrees;
    },
    /** shiftX moves the person across, as a share of the picture's width, towards the right of the mirror. */
    async showFootage(name, { from = 0, playing = true, height = 1, shiftY = 0, shiftX = 0 } = {}) {
      const source = `/test/fixtures/body/${name}.webm`;
      if (footage.dataset.clip !== source) {
        // All of it, as the test server can't send part of a file, and a clip can't seek without that.
        const blob = await (await fetch(source)).blob();
        footage.dataset.clip = source;
        footage.src = URL.createObjectURL(blob);
        await new Promise((resolve, reject) => {
          footage.onloadeddata = resolve;
          footage.onerror = () => reject(new Error(`cannot load ${source}`));
        });
      }
      footage.pause();
      await new Promise((resolve) => {
        footage.onseeked = resolve;
        footage.currentTime = from;
      });
      scene.people = 0;
      scene.footage = true;
      scene.footageHeight = height;
      scene.footageShiftY = shiftY;
      scene.footageShiftX = shiftX;
      scene.footageTilt = 0;
      if (playing) await footage.play();
    },
    /** An empty room. */
    showNobody() {
      footage.pause();
      for (const video of people) video.pause();
      scene.people = 0;
      scene.footage = false;
      Object.assign(scene, DEFAULTS, { left: null, right: null });
    },
    get activeTracks() {
      return (window.__camera.stream?.getTracks() ?? []).filter((track) => track.readyState === 'live').length;
    },
  };

  function drawHand(ctx, name, centreX, centreY, side, scale) {
    if (!name) return;
    const image = loadPhoto(name);
    // The whole canvas is flipped afterwards, so a photo that already shows this hand has
    // to be flipped here too, to arrive at the camera the right way round.
    const flip = PHOTO_HAND[name] === side;
    if (!image.complete || !image.naturalWidth) return;
    const palm = scene.sameHand ? PALM[name] : null;
    const fit = palm ? PALM.open.size / palm.size : 1;
    const height = PHOTO_HEIGHT * scale * fit;
    const width = (height * image.naturalWidth) / image.naturalHeight;
    ctx.save();
    // The palm's middle, rather than the photo's, goes where the hand is. On the left it's the other way across.
    if (palm) ctx.translate(-(side === 'right' ? palm.x : -palm.x) * scale * fit, -palm.y * scale * fit);
    ctx.translate(centreX, centreY);
    ctx.rotate((scene.rotate * Math.PI) / 180);
    if (flip) ctx.scale(-1, 1);
    ctx.scale(scene.squeeze, scene[`${side}Shorten`] ?? scene.shorten);
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();
  }

  function startCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    const draw = () => {
      ctx.setTransform(-1, 0, 0, 1, WIDTH, 0);
      ctx.fillStyle = '#c9ccd1';
      ctx.filter = 'none';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.filter = `brightness(${scene.brightness}) blur(${scene.blur}px)`;
      if (scene.people) {
        // Webcams send the unmirrored picture, as does this footage, so undo the flip above: the first person,
        // on the left of the screen, is on the right of this picture.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        const share = WIDTH / scene.people;
        for (let index = 0; index < scene.people; index += 1) {
          const video = people[index];
          if (video.dataset.there !== 'yes' || !video.videoWidth) continue;
          const wide = video.videoWidth / scene.people;
          const from = Math.min(video.videoWidth - wide, Math.max(0, Number(video.dataset.at) * video.videoWidth - wide / 2));
          ctx.drawImage(video, from, 0, wide, video.videoHeight, WIDTH - (index + 1) * share, 0, share, HEIGHT);
        }
        return;
      }
      if (scene.footage) {
        // Webcams send the unmirrored picture, as does this footage, so undo the flip above.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const height = HEIGHT * scene.footageHeight;
        const width = (height * footage.videoWidth) / footage.videoHeight;
        // The picture isn't mirrored, so the right of the mirror is the left of this picture.
        ctx.fillStyle = '#808080';
        if (scene.footageShiftX || scene.footageTilt) ctx.fillRect(0, 0, WIDTH, HEIGHT);
        if (scene.footageTilt) {
          // About the feet, near the bottom of the picture. The right of the mirror is the left of this picture.
          ctx.translate(WIDTH / 2, HEIGHT * 0.94);
          ctx.rotate((-scene.footageTilt * Math.PI) / 180);
          ctx.translate(-WIDTH / 2, -HEIGHT * 0.94);
        }
        ctx.drawImage(footage, (WIDTH - width) / 2 - (scene.footageShiftX ?? 0) * WIDTH, (HEIGHT - height) / 2 + scene.footageShiftY * HEIGHT, width, height);
        return;
      }
      const middle = HEIGHT / 2;
      const drawLeft = () => drawHand(ctx, scene.left, SLOT_X.left + scene.leftOffsetX, middle + scene.leftOffsetY, 'left', scene.scale);
      const drawRight = () => drawHand(ctx, scene.right, SLOT_X.right + scene.rightOffsetX, middle + scene.rightOffsetY, 'right', scene.scale);
      for (const draw of scene.leftOnTop ? [drawRight, drawLeft] : [drawLeft, drawRight]) draw();
    };
    draw();
    setInterval(draw, 33);
    return canvas.captureStream(30);
  }

  const fakeGetUserMedia = async () => {
    const { failWith } = window.__camera;
    if (failWith) throw new DOMException('Simulated camera problem', failWith);
    window.__camera.streams += 1;
    window.__camera.stream = startCanvas();
    return window.__camera.stream;
  };

  // Load the photos up front so a scene change is instant.
  ['open', 'fist', 'pointing', 'victory', 'thumbs-up', 'relaxed', 'palm', 'back'].forEach(loadPhoto);

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: fakeGetUserMedia },
  });
})();
