import { SidSynth } from './sid.js';
import { CPU_CLOCK } from './timing.js';

// SID2 stores absolute NTSC bus clocks and individual register writes from VICE.
// This preserves the original main-loop cadence, including raster IRQ delays.
export function decodeMusic(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 16 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'SID2') {
    throw new Error('Invalid SID2 trace.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const loopStart = view.getUint32(4, true), duration = view.getUint32(8, true);
  const count = view.getUint32(12, true);
  if (bytes.length !== 16 + count * 6 || loopStart >= duration) throw new Error('Truncated SID2 trace.');
  const clocks = new Uint32Array(count), registers = new Uint8Array(count), values = new Uint8Array(count);
  let loopIndex = count;
  for (let i = 0; i < count; i++) {
    const offset = 16 + i * 6;
    clocks[i] = view.getUint32(offset, true);
    registers[i] = bytes[offset + 4];
    values[i] = bytes[offset + 5];
    if (clocks[i] >= duration || (i && clocks[i] < clocks[i - 1]) || registers[i] > 24) {
      throw new Error('Invalid SID2 event.');
    }
    if (clocks[i] >= loopStart && loopIndex === count) loopIndex = i;
  }
  if (!count || loopIndex === count) throw new Error('Empty SID2 loop.');
  return { clocks, registers, values, loopStart, loopIndex, duration };
}

export class SidPlayback {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.synth = new SidSynth(sampleRate);
    this.active = false;
    this.paused = false;
    this.clock = 0;
    this.event = 0;
  }

  receive(message) {
    if (message.type === 'load') {
      this.trace = decodeMusic(message.buffer);
      this.synth = new SidSynth(this.sampleRate);
      this.clock = 0;
      this.event = 0;
      this.active = true;
    } else if (message.type === 'stop') this.active = false;
    else if (message.type === 'pause') this.paused = message.value;
  }

  render(output) {
    if (!this.active || this.paused) { output.fill(0); return; }
    const t = this.trace;
    for (let i = 0; i < output.length; i++) {
      if (this.clock >= t.duration) {
        this.clock -= t.duration - t.loopStart;
        this.event = t.loopIndex;
      }
      while (this.event < t.clocks.length && t.clocks[this.event] <= this.clock) {
        this.synth.write(t.registers[this.event], t.values[this.event]);
        this.event++;
      }
      output[i] = this.synth.sample();
      this.clock += CPU_CLOCK / this.sampleRate;
    }
  }
}
