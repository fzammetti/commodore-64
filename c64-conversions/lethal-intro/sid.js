import { CPU_CLOCK } from "./timing.js";

const RATE_CYCLES = [9, 32, 63, 95, 149, 220, 267, 313, 392, 977, 1954, 3126, 3907, 11720, 19532, 31251];
const PHASE_LIMIT = 16777216;


export function decodeSidTrace(inBuffer) {
  const bytes = new Uint8Array(inBuffer);
  const frames = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 2 > bytes.length) {
      throw new Error(`Truncated SID frame header.`);
    }
    const size = (bytes[offset] | (bytes[offset + 1] << 8)) * 2;
    offset += 2;
    if (offset + size > bytes.length) {
      throw new Error(`Truncated SID register frame.`);
    }
    const frame = bytes.subarray(offset, offset + size);
    for (let index = 0; index < size; index += 2) {
      if (frame[index] > 24) {
        throw new Error(`Invalid SID register.`);
      }
    }
    frames.push(frame);
    offset += size;
  }
  return frames;
}


function createVoice() {
  return {
    phase: 0, oldPhase: 0, noise: 0x7ffff8, envelope: 0, stage: `release`,
    frequency: 0, pulse: 2048, control: 0, attack: 0, decay: 0, sustain: 0, release: 0
  };
}


export class SidSynth {

  constructor(inSampleRate) {
    this.sampleRate = inSampleRate * 2;
    this.registers = new Uint8Array(25);
    this.voices = [createVoice(), createVoice(), createVoice()];
    this.low = 0;
    this.band = 0;
    this.dc = 0;
    this.filterCoefficient = 0.01;
    this.damping = 1.5;
  }

  write(inRegister, inValue) {
    const previous = this.registers[inRegister];
    this.registers[inRegister] = inValue;
    if (inRegister < 21) {
      const voice = this.voices[Math.floor(inRegister / 7)];
      const base = Math.floor(inRegister / 7) * 7;
      const r = this.registers;
      voice.frequency = (r[base] | (r[base + 1] << 8)) * CPU_CLOCK / this.sampleRate;
      voice.pulse = r[base + 2] | ((r[base + 3] & 15) << 8);
      voice.control = r[base + 4];
      voice.attack = r[base + 5] >> 4;
      voice.decay = r[base + 5] & 15;
      voice.sustain = (r[base + 6] >> 4) * 17;
      voice.release = r[base + 6] & 15;
      if (inRegister % 7 === 4 && ((previous ^ inValue) & 1)) {
        voice.stage = inValue & 1 ? `attack` : `release`;
      }
      if (voice.control & 8) {
        voice.phase = 0;
        voice.noise = 0x7ffff8;
      }
    } else if (inRegister < 24) {
      const cutoff = (this.registers[21] & 7) | (this.registers[22] << 3);
      const frequency = Math.min(30 + cutoff * 5.8, this.sampleRate * 0.18);
      this.filterCoefficient = 2 * Math.sin(Math.PI * frequency / this.sampleRate);
      this.damping = 1.5 - (this.registers[23] >> 4) / 15 * 1.35;
    }
  }

  envelope(inVoice) {
    let rate = inVoice.release;
    if (inVoice.stage === `attack`) {
      rate = inVoice.attack;
    } else if (inVoice.stage === `decay`) {
      rate = inVoice.decay;
    }
    const value = inVoice.envelope;
    let exponential = 1;
    if (inVoice.stage !== `attack`) {
      if (value < 6) {
        exponential = 30;
      } else if (value < 14) {
        exponential = 16;
      } else if (value < 26) {
        exponential = 8;
      } else if (value < 54) {
        exponential = 4;
      } else if (value < 93) {
        exponential = 2;
      }
    }
    const change = CPU_CLOCK / (RATE_CYCLES[rate] * exponential * this.sampleRate);
    if (inVoice.stage === `attack`) {
      inVoice.envelope = Math.min(255, value + change);
      if (inVoice.envelope === 255) {
        inVoice.stage = `decay`;
      }
    } else if (inVoice.stage === `decay`) {
      if (value > inVoice.sustain) {
        inVoice.envelope = Math.max(inVoice.sustain, value - change);
      }
    } else {
      inVoice.envelope = Math.max(0, value - change);
    }
    return inVoice.envelope / 255;
  }

  oscillator(inVoice, inPrevious) {
    const control = inVoice.control;
    if (control & 8) {
      return 0;
    }
    const phase = Math.floor(inVoice.phase);
    let value = 4095;
    if (control & 16) {
      let triangle = phase;
      if ((control & 4) && inPrevious.phase >= PHASE_LIMIT / 2) {
        triangle ^= 0x800000;
      }
      if (triangle & 0x800000) {
        triangle = 0xffffff - triangle;
      }
      value &= triangle >> 11;
    }
    if (control & 32) {
      value &= phase >> 12;
    }
    if (control & 64) {
      value &= (phase >> 12) >= inVoice.pulse ? 4095 : 0;
    }
    if (control & 128) {
      const noise = inVoice.noise;
      const bits = ((noise >> 22) & 1) * 128 + ((noise >> 20) & 1) * 64
        + ((noise >> 16) & 1) * 32 + ((noise >> 13) & 1) * 16
        + ((noise >> 11) & 1) * 8 + ((noise >> 7) & 1) * 4
        + ((noise >> 4) & 1) * 2 + ((noise >> 2) & 1);
      value &= bits << 4;
    }
    return control & 0xf0 ? value / 2047.5 - 1 : 0;
  }

  subsample() {
    for (const voice of this.voices) {
      voice.oldPhase = voice.phase;
      if (!(voice.control & 8)) {
        voice.phase = (voice.phase + voice.frequency) % PHASE_LIMIT;
        if (Math.floor(voice.oldPhase / 0x100000) !== Math.floor(voice.phase / 0x100000)) {
          const bit = ((voice.noise >> 22) ^ (voice.noise >> 17)) & 1;
          voice.noise = ((voice.noise << 1) | bit) & 0x7fffff;
        }
      }
    }
    let filtered = 0;
    let direct = 0;
    for (let index = 0; index < 3; index++) {
      const voice = this.voices[index];
      const previous = this.voices[(index + 2) % 3];
      if ((voice.control & 2) && previous.phase < previous.oldPhase) {
        voice.phase = 0;
      }
      const signal = this.oscillator(voice, previous) * this.envelope(voice);
      if (this.registers[23] & (1 << index)) {
        filtered += signal;
      } else if (index !== 2 || !(this.registers[24] & 128)) {
        direct += signal;
      }
    }
    this.low += this.filterCoefficient * this.band;
    const high = filtered - this.low - this.damping * this.band;
    this.band += this.filterCoefficient * high;
    const mode = this.registers[24];
    let output = direct;
    if (mode & 16) {
      output += this.low;
    }
    if (mode & 32) {
      output += this.band;
    }
    if (mode & 64) {
      output += high;
    }
    output *= (mode & 15) / 15 * 0.24;
    this.dc += (output - this.dc) * 0.001;
    return Math.tanh(output - this.dc);
  }

  sample() {
    return (this.subsample() + this.subsample()) * 0.5;
  }

}
