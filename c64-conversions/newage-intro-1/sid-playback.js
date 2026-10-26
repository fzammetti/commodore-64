import { SidSynth } from './sid.js';
import { MusicPlayer, SID_INIT } from './music.js';
import { FRAME_RATE } from './timing.js';

// Shared sample scheduler for the worklet and the HTTP compatibility backend. It runs
// the translated music player once a frame, as the bars IRQ does from frame 1 on, on a
// copy of the intro's RAM.
export class SidPlayback {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.synth = new SidSynth(sampleRate);
    this.player = null;
    this.frame = 0;
    this.remaining = 0;
    this.active = false;
    this.paused = false;
  }

  receive(message) {
    if (message.type === 'load') {
      this.synth = new SidSynth(this.sampleRate);
      for (const [register, value] of SID_INIT) this.synth.write(register, value);
      this.player = new MusicPlayer(new Uint8Array(message.ram));
      this.frame = 0;
      this.remaining = 0;
      this.active = true;
    } else if (message.type === 'stop') {
      this.active = false;
    } else if (message.type === 'pause') {
      this.paused = message.value;
    }
  }

  render(output) {
    if (!this.active || this.paused || !this.player) {
      output.fill(0);
      return;
    }
    for (let sample = 0; sample < output.length; sample++) {
      if (this.remaining <= 0) {
        if (this.frame++) {
          for (const [register, value] of this.player.play()) this.synth.write(register, value);
        }
        this.remaining += this.sampleRate / FRAME_RATE;
      }
      output[sample] = this.synth.sample();
      this.remaining--;
    }
  }
}
