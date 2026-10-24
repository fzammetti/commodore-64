// Turns display refreshes into C64 frames. A 60 Hz display is within 0.3% of the NTSC
// frame rate, so a plain time accumulator sits on its threshold and timing noise makes it
// run two frames on one refresh and none on the next; smooth scrolls then stutter. When the
// refresh period is near a whole fraction of the C64 frame (60 Hz, 120 Hz, ...), frames
// are locked to refreshes instead. Other rates accumulate time.
// Locking starts within 4% of a whole ratio and ends beyond 8%, so noise cannot flip it.
// In smooth mode (the intro's scrollers) the C64 runs up to 21% off speed so that every
// frame still lasts the same number of refreshes, as on a 72 Hz or 144 Hz display.
const HISTORY = 61, MINIMUM_HISTORY = 8, MAXIMUM_DELTA = 200;
const LOCK = 0.04, UNLOCK = 0.08, SMOOTH_LOCK = 0.21, SMOOTH_UNLOCK = 0.24;

export class FramePacer {
  constructor(frameRate) {
    this.frameTime = 1000 / frameRate;
    this.intervals = [];
    this.locked = false;
    this.smooth = false;
    this.reset();
  }

  // Forget the last refresh (after a pause, a hidden tab or a phase change); the measured
  // refresh rate is kept.
  reset() {
    this.last = null;
    this.accumulator = 0;
    this.refreshes = 0;
  }

  // The number of C64 frames to run for the refresh at `time` (milliseconds).
  frames(time) {
    if (this.last === null) {
      this.last = time;
      return 0;
    }
    const delta = Math.min(Math.max(time - this.last, 0), MAXIMUM_DELTA);
    this.last = time;
    if (delta > 0) {
      this.intervals.push(delta);
      if (this.intervals.length > HISTORY) this.intervals.shift();
    }
    const period = this.refreshPeriod();
    const ratio = period ? this.frameTime / period : 0;
    const perFrame = Math.round(ratio);
    const error = perFrame >= 1 ? Math.abs(ratio - perFrame) / perFrame : Infinity;
    if (this.smooth) this.locked = error < (this.locked ? SMOOTH_UNLOCK : SMOOTH_LOCK);
    else this.locked = error < (this.locked ? UNLOCK : LOCK);
    if (this.locked) {
      this.accumulator = 0;
      this.refreshes += Math.max(1, Math.round(delta / period));
      const frames = Math.floor(this.refreshes / perFrame);
      this.refreshes -= frames * perFrame;
      return Math.min(frames, Math.ceil(MAXIMUM_DELTA / this.frameTime));
    }
    this.refreshes = 0;
    this.accumulator += delta;
    const frames = Math.floor(this.accumulator / this.frameTime);
    this.accumulator -= frames * this.frameTime;
    return frames;
  }

  // The mean of the middle half of recent refresh intervals, once enough have been seen;
  // trimming ignores dropped refreshes and stalls.
  refreshPeriod() {
    if (this.intervals.length < MINIMUM_HISTORY) return 0;
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const middle = sorted.slice(sorted.length >> 2, sorted.length - (sorted.length >> 2));
    return middle.reduce((sum, interval) => sum + interval, 0) / middle.length;
  }
}
