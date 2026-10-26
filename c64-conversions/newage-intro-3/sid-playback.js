import { SidSynth } from './sid.js';
import { IntroModel } from './intro-model.js';
import { CPU_CLOCK } from './timing.js';

// The SID as $17b3 left it before the main loop began: every register 0, then $d418 from
// $1004 ($6f: volume 15).
export const SID_INIT = [...Array.from({ length: 24 }, (_, register) => [register, 0]), [0x18, 0x6f]];

// Shared sample scheduler for the worklet and the HTTP compatibility backend. The music
// player runs in the intro's main loop, so its tempo depends on the time the raster IRQs
// leave it; the scheduler therefore runs its own copy of the whole intro model, without
// the display events, and plays the SID writes at the clocks the model gives them. The
// music starts from the beginning when sound is first switched on; a key sends this copy
// to the game too.
export class SidPlayback {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.synth = new SidSynth(sampleRate);
    this.model = null;
    this.clock = 0;
    this.next = 0;
    this.active = false;
    this.paused = false;
  }

  receive(message) {
    if (message.type === 'load') {
      this.synth = new SidSynth(this.sampleRate);
      for (const [register, value] of SID_INIT) this.synth.write(register, value);
      this.model = new IntroModel({ ram: new Uint8Array(message.ram), io: new Uint8Array(message.io) });
      this.model.recording = false;
      this.clock = this.model.clock;
      this.next = 0;
      this.active = true;
    } else if (message.type === 'key') {
      this.model?.pressKey();
    } else if (message.type === 'stop') {
      this.active = false;
    } else if (message.type === 'pause') {
      this.paused = message.value;
    }
  }

  render(output) {
    if (!this.active || this.paused || !this.model) {
      output.fill(0);
      return;
    }
    const model = this.model, writes = model.sidWrites, step = CPU_CLOCK / this.sampleRate;
    for (let sample = 0; sample < output.length; sample++) {
      this.clock += step;
      model.runUntil(this.clock);
      while (this.next < writes.length && writes[this.next][0] <= this.clock) {
        const [, register, value] = writes[this.next++];
        this.synth.write(register, value);
      }
      // IOINIT turns the volume down on the way to the game.
      output[sample] = this.clock >= model.silenceClock ? 0 : this.synth.sample();
    }
    if (this.next > 4096) {
      writes.splice(0, this.next);
      this.next = 0;
    }
  }
}
