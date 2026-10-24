import { decodeSidTrace, SidSynth } from './sid.js';
import { CPU_CLOCK, FRAME_RATE } from './timing.js';

const LIVE_LATENCY = 0.04;

// Shared sample scheduler for the worklet and the HTTP compatibility backend.
// It plays a recorded per-frame trace, or register writes timed in CPU cycles.
export class SidPlayback {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.synth = new SidSynth(sampleRate);
    this.frames = [];
    this.frame = 0;
    this.remaining = 0;
    this.frameRate = FRAME_RATE;
    this.loopStart = 0;
    this.queue = [];
    this.clock = 0;
    this.active = false;
    this.paused = false;
  }

  receive(message) {
    if (message.type === 'load') {
      this.synth = new SidSynth(this.sampleRate);
      this.frames = decodeSidTrace(message.buffer);
      this.frame = 0;
      this.remaining = 0;
      this.loopStart = message.loopStart;
      this.frameRate = message.frameRate;
      this.queue = [];
      this.active = true;
    } else if (message.type === 'live') {
      this.synth = new SidSynth(this.sampleRate);
      this.frames = [];
      this.queue = [];
      this.active = true;
    } else if (message.type === 'writes') {
      const base = this.clock + Math.round(this.sampleRate * LIVE_LATENCY);
      const writes = message.writes;
      for (let index = 0; index < writes.length; index += 3) {
        this.queue.push([base + Math.round(writes[index] * this.sampleRate / CPU_CLOCK),
          writes[index + 1], writes[index + 2]]);
      }
    } else if (message.type === 'stop') {
      this.active = false;
      this.queue = [];
    } else if (message.type === 'pause') {
      this.paused = message.value;
    }
  }

  render(output) {
    if (!this.active || this.paused) {
      output.fill(0);
      return;
    }
    for (let sample = 0; sample < output.length; sample++) {
      while (this.queue.length && this.queue[0][0] <= this.clock) {
        const [, register, value] = this.queue.shift();
        this.synth.write(register, value);
      }
      if (this.frames.length && this.remaining <= 0) {
        const writes = this.frames[this.frame];
        for (let index = 0; index < writes.length; index += 2) {
          this.synth.write(writes[index], writes[index + 1]);
        }
        this.frame++;
        if (this.frame === this.frames.length) this.frame = this.loopStart;
        this.remaining += this.sampleRate / this.frameRate;
      }
      output[sample] = this.synth.sample();
      this.remaining--;
      this.clock++;
    }
  }
}
