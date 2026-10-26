import { SidSynth } from './sid.js';
import { IntroModel } from './intro-model.js';
import { CPU_CLOCK } from './timing.js';

// The intro's whole soundtrack is what $1e00 sets up before the main loop: three
// sawtooth voices with their gates on, attack 0, sustain 15, at $0614, $0620 and $060F
// (about 95 Hz, slightly apart, so they beat against each other), volume 15. Nothing
// writes the SID again until IOINIT turns the volume down on the way to the game.
export const SID_INIT = [
  [0x05, 0x0f], [0x0c, 0x0f], [0x13, 0x0f], [0x06, 0xff], [0x0d, 0xff], [0x14, 0xff],
  [0x04, 0x21], [0x0b, 0x21], [0x12, 0x21], [0x01, 0x06], [0x08, 0x06], [0x0f, 0x06],
  [0x00, 0x14], [0x07, 0x20], [0x0e, 0x0f], [0x18, 0x0f]
];

// Shared sample scheduler for the worklet and the HTTP compatibility backend. When the
// volume goes down depends on how the exit runs, so the scheduler runs its own copy of
// the intro model, without the display events; a key sends this copy to the game too.
// The drone starts when sound is first switched on.
export class SidPlayback {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.synth = new SidSynth(sampleRate);
    this.model = null;
    this.clock = 0;
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
    const model = this.model, step = CPU_CLOCK / this.sampleRate;
    for (let sample = 0; sample < output.length; sample++) {
      this.clock += step;
      model.runUntil(this.clock);
      // IOINIT turns the volume down on the way to the game.
      output[sample] = this.clock >= model.silenceClock ? 0 : this.synth.sample();
    }
  }
}
