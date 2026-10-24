import { decodeSidTrace, SidSynth } from './sid.js';
import { FRAME_RATE, CYCLES_PER_FRAME } from './timing.js';

// Shared sample scheduler for the worklet and the HTTP compatibility backend. It plays
// either a captured trace (one block of register writes per frame) or live frames sent by
// a model, whose writes carry their cycle offset inside the frame.
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
    this.live = false;
    this.queue = [];
    this.current = null;
    this.position = 0;
    this.frameSamples = sampleRate / FRAME_RATE;
  }

  receive(message) {
    if (message.type === 'load') {
      this.synth = new SidSynth(this.sampleRate);
      this.frames = decodeSidTrace(message.buffer);
      this.frame = 0;
      this.remaining = 0;
      this.loopStart = message.loopStart;
      this.frameRate = message.frameRate;
      this.live = false;
      this.active = true;
    } else if (message.type === 'live') {
      // The SID keeps its voices across programs unless a fresh chip is requested.
      if (message.reset || !this.active) this.synth = new SidSynth(this.sampleRate);
      this.frameRate = FRAME_RATE;
      this.queue = [];
      this.current = null;
      this.remaining = 0;
      this.live = true;
      this.active = true;
    } else if (message.type === 'frame' && this.live) {
      this.queue.push(message.writes);
      // Catch up if the page outruns the audio clock: apply the oldest frames at once.
      while (this.queue.length > 6) this.apply(this.queue.shift(), Infinity);
    } else if (message.type === 'stop') {
      this.active = false;
      this.live = false;
      this.queue = [];
    } else if (message.type === 'pause') {
      this.paused = message.value;
    }
  }

  // Apply the live writes (offset, register, value triples) up to `cycle`.
  apply(writes, cycle) {
    let index = writes === this.current ? this.position : 0;
    for (; index < writes.length && writes[index] <= cycle; index += 3) {
      this.synth.write(writes[index + 1], writes[index + 2]);
    }
    if (writes === this.current) this.position = index;
  }

  render(output) {
    if (!this.active || this.paused || (!this.live && this.frames.length === 0)) {
      output.fill(0);
      return;
    }
    const samplesPerFrame = this.sampleRate / this.frameRate;
    for (let sample = 0; sample < output.length; sample++) {
      if (this.remaining <= 0) {
        if (this.live) {
          if (this.current) this.apply(this.current, Infinity);
          this.current = this.queue.shift() || null;
          this.position = 0;
          // A page locked to a 60 Hz display sends frames 0.3% fast; play live frames 1%
          // shorter while a backlog builds, rather than applying frames at once.
          this.frameSamples = samplesPerFrame * (this.queue.length > 2 ? 0.99 : 1);
        } else {
          const writes = this.frames[this.frame];
          for (let index = 0; index < writes.length; index += 2) {
            this.synth.write(writes[index], writes[index + 1]);
          }
          this.frame++;
          if (this.frame === this.frames.length) this.frame = this.loopStart;
        }
        this.remaining += this.live ? this.frameSamples : samplesPerFrame;
      }
      if (this.live && this.current) {
        this.apply(this.current, (1 - this.remaining / this.frameSamples) * CYCLES_PER_FRAME);
      }
      output[sample] = this.synth.sample();
      this.remaining--;
    }
  }
}
