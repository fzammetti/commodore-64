import { CLEAR_CYCLES, RECORD_CYCLES } from './finale-timing.js';
import { CYCLES_PER_FRAME } from './timing.js';
import { CAPTURED_SWAP_CYCLES, CAPTURED_LOOP_FRAMES, CAPTURED_INITIAL_FRAME_CYCLE } from './finale-cadence.js';

function capture(input, size, name) {
  const bytes = new Uint8Array(input);
  if (bytes.length !== size) throw new Error(`${name} must contain ${size} bytes.`);
  return bytes.slice();
}

/** Native $C000-$C374 vector player. It repeatedly draws 71 recovered poses.
 * Display cadence comes from four measured VICE NTSC loops, including VIC and
 * IRQ work. Original instruction counts and D012 polling remain available for
 * analysis; sampled pose changes follow the verified 795-frame loop cadence.
 */
export class FinaleModel {
  constructor(memory, io) {
    this.memory = capture(memory, 65536, 'RAM');
    this.io = capture(io, 4096, 'I/O');
    this.frame = 0;
    this.pose = -1;
    this.poses = 71;
    this.loops = 0;
    this.record = 0;
    this.elapsedCycles = 0;
    this.instructionCycles = 0;
    this.displayBitmap = 0x4000;
    this.drawBitmap = 0x2000;
    this.initialRaster = this.io[0x12] | ((this.io[0x11] & 128) << 1);
    this.cycleCursor = CAPTURED_INITIAL_FRAME_CYCLE;
    this.initialCycles = this.cycleCursor;
    this.swapsCommitted = 0;
    this.timingMode = 'captured-ntsc-cadence';
    this.cadencePeriodFrames = CAPTURED_LOOP_FRAMES;
    this.swapCycles = [];
    this.preparePose();
  }

  plot(x, y, bitmap) {
    if (y >= 200 || x >= 320 || y < 0 || x < 0) return;
    const address = bitmap + (y & 0xf8) * 40 + (x & 0xfff8) + (y & 7);
    this.memory[address] |= 0x80 >> (x & 7);
  }

  // The original's two major-axis branches use the same inclusive Bresenham
  // recurrence; the vertical coordinate wraps at eight bits, X at sixteen.
  drawLine(x1, y1, x2, y2, bitmap = this.drawBitmap) {
    let difference = (x2 - x1) & 65535;
    if (difference & 0x8000) difference -= 65536;
    const sx = difference < 0 ? -1 : 1;
    const sy = y2 < y1 ? -1 : 1;
    const dx = Math.abs(difference), dy = Math.abs(y2 - y1);
    let x = x1, y = y1;
    if (dx < dy) {
      let error = dx * 2 - dy;
      for (let count = dy + 1; count > 0; count--) {
        this.plot(x, y, bitmap);
        y = (y + sy) & 255;
        if (error >= 0) { x = (x + sx) & 65535; error += dx * 2 - dy * 2; }
        else error += dx * 2;
      }
    } else {
      let error = dy * 2 - dx;
      for (let count = dx + 1; count > 0; count--) {
        this.plot(x, y, bitmap);
        x = (x + sx) & 65535;
        if (error >= 0) { y = (y + sy) & 255; error += dy * 2 - dx * 2; }
        else error += dy * 2;
      }
    }
  }

  waitForRasterZero(cycles) {
    // Original polling iteration: LDA #0 (2), CMP D012 (4), BNE (3/2).
    // Sample the register at the end of CMP. Its low byte is zero on two
    // NTSC raster lines, separated by the final seven lines of the frame.
    for (;;) {
      const raster = Math.floor((cycles + 6) / 65) % 263;
      if (raster === 0 || raster === 256) return cycles + 8;
      cycles += 9;
    }
  }

  preparePose() {
    const bitmap = this.drawBitmap;
    this.memory.fill(0, bitmap, bitmap + 8192);
    let work = 42 + CLEAR_CYCLES + 6;
    let marker;
    let records = 0;
    do {
      const address = 0x6400 + this.record * 8;
      const y1 = this.memory[address];
      const x1 = this.memory[address + 1] | this.memory[address + 2] << 8;
      const y2 = this.memory[address + 3];
      const x2 = this.memory[address + 4] | this.memory[address + 5] << 8;
      marker = this.memory[address + 7];
      this.drawLine(x1, y1, x2, y2, bitmap);
      work += 6 + RECORD_CYCLES[this.record] + 2 + (marker === 0 ? 3 : 2);
      this.record++;
      records++;
      if (records > RECORD_CYCLES.length) throw new Error('Vector pose has no terminating record.');
    } while (marker === 0);
    this.instructionCycles += work;
    const ready = this.waitForRasterZero(this.cycleCursor + work);
    const switchCycles = bitmap === 0x2000 ? 16 : 18;
    const instructionSwitchAt = ready + switchCycles;
    const cadenceIndex = this.swapsCommitted % this.poses;
    const cadenceLoops = Math.floor(this.swapsCommitted / this.poses);
    const switchAt = this.initialCycles + CAPTURED_SWAP_CYCLES[cadenceIndex] +
      cadenceLoops * CAPTURED_LOOP_FRAMES * CYCLES_PER_FRAME;
    const reset = marker !== 254;
    this.pending = {
      bitmap, switchAt, instructionSwitchAt, reset, records,
      nextStart: switchAt + 2 + (reset ? 26 : 3) + (bitmap === 0x4000 ? 3 : 0)
    };
    if (reset) this.record = 0;
  }

  commitPose() {
    const pending = this.pending;
    this.displayBitmap = pending.bitmap;
    this.drawBitmap = this.displayBitmap === 0x2000 ? 0x4000 : 0x2000;
    if (this.displayBitmap === 0x2000) {
      this.io[0xd00] |= 3;
      this.io[0x18] = 0x18;
    } else {
      this.io[0xd00] = (this.io[0xd00] & 0xfc) | 2;
      this.io[0x18] = 0x80;
    }
    this.pose = (this.pose + 1) % this.poses;
    this.swapsCommitted++;
    if (pending.reset) this.loops++;
    this.swapCycles.push(pending.switchAt - this.initialCycles);
    // Keep a bounded recent history for timing inspection during playback.
    if (this.swapCycles.length > this.poses * 2) this.swapCycles.shift();
    this.cycleCursor = pending.nextStart;
    this.preparePose();
  }

  step() {
    this.elapsedCycles += CYCLES_PER_FRAME;
    const target = this.initialCycles + this.elapsedCycles;
    while (this.pending.switchAt <= target) this.commitPose();
    this.frame++;
  }
}
