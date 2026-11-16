// Opens the webcam and passes frames to a tracking worker, one at a time.
// A frame is only sent once the previous result is back, so a slow computer drops
// frames instead of falling further and further behind the child's real movements.

export class CameraProblem extends Error {
  constructor(kind, cause) {
    super(kind);
    this.kind = kind; // 'insecure' | 'denied' | 'none' | 'busy' | 'tracker' | 'other'
    this.cause = cause;
  }
}

function explainCameraError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new CameraProblem('denied', error);
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new CameraProblem('none', error);
    case 'NotReadableError':
    case 'AbortError':
      return new CameraProblem('busy', error);
    default:
      return new CameraProblem('other', error);
  }
}

export class TrackingCamera {
  /**
   * worker is the tracking script to run, and trackingWidth the size of picture it gets.
   * closeUps, if given, returns close-ups to send along with a frame.
   */
  constructor(video, {
    worker = new URL('./tracker.worker.js', import.meta.url),
    width = 1280,
    height = 720,
    trackingWidth = 960,
    closeUps = null,
  } = {}) {
    this.video = video;
    this.workerUrl = worker;
    this.size = { width, height };
    this.trackingWidth = trackingWidth;
    this.closeUps = closeUps;
    this.onResult = () => {};
    this.onTrackerError = () => {};
    this.worker = null;
    this.trackerReady = null;
    this.stream = null;
    this.running = false;
    this.busy = false;
    this.lastResultAt = 0;
    this.delegate = null;
    this.people = 1; // How many people a body tracker is to look for: see setPeople.
    // How far the camera and its tracker have got, each from 0 to 1, for the bar on the loading card
    // (core/loading.js), which hears of each change through onProgress.
    this.progress = { camera: 0, tracker: 0 };
    this.onProgress = () => {};
  }

  /** The camera, or its tracker, has got this far. */
  reached(what, share) {
    this.progress[what] = share;
    this.onProgress();
  }

  get aspect() {
    return this.video.videoWidth / this.video.videoHeight || 16 / 9;
  }

  /**
   * How many people are playing in front of this camera, for a tracker that can look for more than one: the
   * body tracker. It's told now if it's loaded, and as it loads if it isn't.
   */
  setPeople(count) {
    if (count === this.people) return;
    this.people = count;
    if (this.delegate) this.worker.postMessage({ type: 'people', count });
  }

  async start() {
    if (this.running) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new CameraProblem('insecure');
    }
    try {
      await Promise.all([this.openCamera(), this.loadTracker()]);
    } catch (problem) {
      // Don't leave the camera on if the game can't start after all.
      this.stop();
      throw problem;
    }
    this.running = true;
    this.busy = false;
    this.lastResultAt = performance.now();
    this.scheduleFrame();
  }

  /** Turns the camera off, including its light. The tracker stays loaded for next time. */
  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.progress.camera = 0;
  }

  async openCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: this.size.width },
          height: { ideal: this.size.height },
          frameRate: { ideal: 30, max: 30 },
        },
      });
    } catch (error) {
      throw explainCameraError(error);
    }
    this.video.srcObject = this.stream;
    await this.video.play();
    this.reached('camera', 1);
  }

  loadTracker() {
    if (this.trackerReady) return this.trackerReady;
    this.trackerReady = new Promise((resolve, reject) => {
      this.worker = new Worker(this.workerUrl, { type: 'module' });
      const failToStart = (cause) => {
        this.worker.terminate();
        this.trackerReady = null;
        this.progress.tracker = 0;
        reject(new CameraProblem('tracker', cause));
      };
      this.worker.onerror = (event) => failToStart(event.message);
      this.worker.onmessage = ({ data }) => {
        if (data.type === 'ready') {
          this.delegate = data.delegate;
          this.reached('tracker', 1);
          resolve();
        } else if (data.type === 'progress') {
          // The tracker's files, its model, and its first look, which is the slow one the first time.
          this.reached('tracker', Math.max(this.progress.tracker, data.share));
        } else if (data.type === 'result') {
          this.busy = false;
          this.lastResultAt = performance.now();
          if (this.running) this.onResult(data);
        } else if (data.type === 'error') {
          this.busy = false;
          if (this.delegate) this.onTrackerError(data.message);
          else failToStart(data.message);
        }
      };
      this.worker.postMessage({ type: 'init', people: this.people });
    });
    return this.trackerReady;
  }

  scheduleFrame() {
    if (this.running) this.video.requestVideoFrameCallback(() => this.sendFrame());
  }

  async sendFrame() {
    if (!this.running) return;
    const { video } = this;
    if (!this.busy && video.readyState >= 2 && video.videoWidth > 0) {
      this.busy = true;
      const width = Math.min(this.trackingWidth, video.videoWidth);
      const height = Math.round((width * video.videoHeight) / video.videoWidth);
      try {
        const bitmap = await createImageBitmap(video, {
          resizeWidth: width,
          resizeHeight: height,
          resizeQuality: 'medium',
        });
        const closeUps = (await this.closeUps?.(video)) ?? [];
        if (this.running) {
          this.worker.postMessage(
            { type: 'frame', bitmap, timestamp: performance.now(), width, height, closeUps },
            [bitmap, ...closeUps.map((closeUp) => closeUp.bitmap)],
          );
        } else {
          bitmap.close();
          for (const closeUp of closeUps) closeUp.bitmap.close();
          this.busy = false;
        }
      } catch {
        // The video can briefly have no frame while it starts or stops.
        this.busy = false;
      }
    }
    this.scheduleFrame();
  }
}
