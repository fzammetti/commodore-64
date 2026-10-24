import { decodeSidTrace, SidSynth } from './sid.js';
import { FRAME_RATE } from './timing.js';

// Shared sample scheduler for the worklet and the HTTP compatibility backend.
export class SidPlayback {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.synth = new SidSynth(sampleRate);
    this.frames = [];
    this.frame = 0;
    this.remaining = 0;
    this.frameRate = FRAME_RATE;
    this.loopStart = 0;
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
      this.active = true;
    } else if (message.type === 'stop') {
      this.active = false;
    } else if (message.type === 'pause') {
      this.paused = message.value;
    }
  }

  render(output) {
    if (!this.active || this.paused || this.frames.length === 0) {
      output.fill(0);
      return;
    }
    for (let sample = 0; sample < output.length; sample++) {
      if (this.remaining <= 0) {
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
    }
  }
}
