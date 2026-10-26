import {
  IMPLIED, IMMEDIATE, ZP_READ, ZP_WRITE, ZP_RMW, ABS_READ, ABS_WRITE, ABS_RMW, INDIRECT_Y,
  JSR, RTS, JMP, BRANCH, BRANCH_TAKEN, BRANCH_CROSS, PUSH, PULL
} from './bus.js';

// Translation of the music player at $08cf, which the bars IRQ calls once a frame. Its
// three voices step through their own order lists and patterns, which have unrelated
// lengths, so the tune as a whole does not repeat for a very long time; the player is
// translated instead of captured. It works on a copy of the intro's RAM ($0a84-$0e34,
// and voice 1's notes, which a stray pointer finds at $0101 and $12d1) and returns each
// frame's SID writes as [register, value] pairs. It also records the call's bus cycles
// in `bus`, up to its JMP $EA31, so the bars IRQ can be timed.

// The writes $0810 made before the main loop began.
export const SID_INIT = [
  ...Array.from({ length: 24 }, (_, register) => [register, 0]),
  [0x18, 0x0f], [0x0a, 0x07], [0x0c, 0x07], [0x13, 0x27], [0x0d, 0x20], [0x14, 0x60]
];

// Per voice: duration and repeat counters, pattern pointer, order pointer and the order
// list's start, the two registers a note sets, and the control register with the gate
// off and on values.
const VOICES = [
  { duration: 0x0a86, repeat: 0x0a89, pattern: 0x0a8c, order: 0x0d64, first: 0x0d6a,
    registers: [0x01, 0x05], control: 0x04, waveform: 0x80 },
  { duration: 0x0a87, repeat: 0x0a8a, pattern: 0x0a8e, order: 0x0d66, first: 0x0d6e,
    registers: [0x07, 0x08], control: 0x0b, waveform: 0x40 },
  { duration: 0x0a88, repeat: 0x0a8b, pattern: 0x0a90, order: 0x0d68, first: 0x0dc0,
    registers: [0x0e, 0x0f], control: 0x12, waveform: 0x40 }
];

// LDA (zp),Y reads once more when it crosses a page.
const indirect = (pointer, y) => ((pointer & 255) + y > 255 ? INDIRECT_Y + 'r' : INDIRECT_Y);

// The KERNAL's IRQ handler from the player's JMP $EA31 to $EA81, with no key down:
// UDTIM (the jiffy clock, then the STOP key), the cassette sense, SCNKEY, and the read of
// CIA 1's flags. A carry into $a1 adds a BNE not taken and an INC, one into $a0 two more.
const JIFFY = JMP + JSR + JMP + IMMEDIATE + ZP_RMW;
const KERNAL_TAIL = BRANCH_TAKEN
  + IMPLIED + ZP_READ + IMMEDIATE + ZP_READ + IMMEDIATE + ZP_READ + IMMEDIATE + BRANCH_TAKEN
  + ABS_READ + ABS_READ + BRANCH + IMPLIED + BRANCH_TAKEN + ZP_WRITE + RTS
  + ZP_READ + BRANCH_TAKEN + ZP_READ + IMMEDIATE + BRANCH + IMMEDIATE + ZP_WRITE + ZP_READ
  + IMMEDIATE + BRANCH_TAKEN + ZP_WRITE
  + JSR + IMMEDIATE + ABS_WRITE + IMMEDIATE + ZP_WRITE + ABS_WRITE + ABS_READ + IMMEDIATE
  + BRANCH_TAKEN + BRANCH_CROSS + ZP_READ + ZP_WRITE + ABS_READ + ABS_WRITE + IMMEDIATE
  + BRANCH_TAKEN + IMMEDIATE + ABS_WRITE + RTS + ABS_READ;
export function kernalBus(jiffy) {
  const carry = jiffy[2] === 0, carryOn = carry && jiffy[1] === 0;
  if (!carry) return JIFFY + KERNAL_TAIL;
  if (!carryOn) return JIFFY + BRANCH + ZP_RMW + KERNAL_TAIL;
  return JIFFY + BRANCH + ZP_RMW + BRANCH + ZP_RMW + KERNAL_TAIL.slice(BRANCH_TAKEN.length);
}

export class MusicPlayer {
  constructor(ram) {
    this.m = new Uint8Array(ram).slice();
    this.bus = '';
  }

  word(address) {
    return this.m[address] | (this.m[address + 1] << 8);
  }

  setWord(address, value) {
    this.m[address] = value & 255;
    this.m[address + 1] = (value >> 8) & 255;
  }

  play() {
    const m = this.m, writes = [];
    // CLD, save $fa/$fb, test $0a84; at the end ($08c3) restore them and read CIA 1's
    // flags.
    let bus = IMPLIED + ZP_READ + PUSH + ZP_READ + PUSH + ABS_READ;
    const end = PULL + ZP_WRITE + PULL + ZP_WRITE + ABS_READ;
    if (!m[0x0a84]) {
      this.bus = bus + BRANCH + JMP + end;
      return writes;
    }
    // $0e35: voice 3's pulse width sweeps up by $80 a frame through $100-$EFF.
    bus += BRANCH_TAKEN + JSR + ABS_READ + IMPLIED + IMMEDIATE + ABS_WRITE + ABS_WRITE
      + ABS_READ + IMMEDIATE + IMMEDIATE + IMMEDIATE;
    const low = m[0x0e32] + 0x80;
    m[0x0e32] = low & 255;
    let high = (m[0x0e33] + (low >> 8)) & 15;
    if (high === 15) {
      high = 1;
      bus += BRANCH + IMMEDIATE;
    } else bus += BRANCH_TAKEN;
    bus += ABS_WRITE + ABS_WRITE + RTS;
    m[0x0e33] = high;
    writes.push([0x10, low & 255], [0x11, high]);
    // The notes move every seventh frame ($0e34).
    m[0x0a85] = (m[0x0a85] - 1) & 255;
    bus += ABS_RMW;
    if (m[0x0a85]) {
      this.bus = bus + BRANCH + JMP + end;
      return writes;
    }
    m[0x0a85] = m[0x0e34];
    this.bus = bus + BRANCH_TAKEN + ABS_READ + ABS_WRITE;
    for (const voice of VOICES) this.voice(voice, writes);
    this.bus += JMP + end;
    return writes;
  }

  // A note is four bytes: two register values, its length, and how many times it plays.
  // A 1 ends the pattern and the order list moves on; a zero entry there starts the
  // list again.
  voice(voice, writes) {
    const m = this.m;
    let bus = ABS_READ;
    if (!m[voice.duration]) {
      bus += BRANCH_TAKEN + ABS_READ + ZP_WRITE + ABS_READ + ZP_WRITE;
      let pointer = this.word(voice.pattern);
      for (;;) {
        bus += IMMEDIATE + indirect(pointer, 0) + IMMEDIATE;
        if (m[pointer] !== 1) break;
        // The order pointer moves on two bytes, and $0dea fetches the entry through
        // ($f8),Y; a zero entry sets the pointer back to the start and fetches again.
        bus += BRANCH + ABS_READ + IMPLIED + IMMEDIATE + ABS_WRITE + ABS_READ + IMMEDIATE
          + ABS_WRITE + JSR;
        this.setWord(voice.order, this.word(voice.order) + 2);
        for (;;) {
          const order = this.word(voice.order);
          this.setWord(voice.pattern, this.word(order));
          bus += ABS_READ + ZP_WRITE + ABS_READ + ZP_WRITE + IMMEDIATE + indirect(order, 0)
            + ABS_WRITE + IMPLIED + indirect(order, 1) + ABS_WRITE + RTS
            + ABS_READ + ZP_WRITE + ABS_READ + ZP_WRITE + ZP_READ;
          if (this.word(voice.pattern)) break;
          bus += BRANCH + IMMEDIATE + ABS_WRITE + IMMEDIATE + ABS_WRITE + JMP + JSR;
          this.setWord(voice.order, voice.first);
        }
        bus += BRANCH_TAKEN;
        pointer = this.word(voice.pattern);
      }
      writes.push([voice.registers[0], m[pointer]], [voice.registers[1], m[pointer + 1]],
        [voice.control, voice.waveform], [voice.control, voice.waveform | 1]);
      bus += BRANCH_TAKEN + ABS_WRITE + IMPLIED + indirect(pointer, 1) + ABS_WRITE
        + IMMEDIATE + ABS_WRITE + IMMEDIATE + ABS_WRITE
        + IMPLIED + indirect(pointer, 2) + ABS_WRITE + ABS_READ;
      m[voice.duration] = m[pointer + 2];
      if (!m[voice.repeat]) {
        m[voice.repeat] = m[pointer + 3];
        bus += BRANCH + IMPLIED + indirect(pointer, 3) + ABS_WRITE;
      } else bus += BRANCH_TAKEN;
      m[voice.repeat] = (m[voice.repeat] - 1) & 255;
      bus += ABS_RMW;
      if (!m[voice.repeat]) {
        this.setWord(voice.pattern, pointer + 4);
        bus += BRANCH + ABS_READ + IMPLIED + IMMEDIATE + ABS_WRITE + ABS_READ + IMMEDIATE
          + ABS_WRITE;
      } else bus += BRANCH_TAKEN;
    } else bus += BRANCH + JMP;
    m[voice.duration] = (m[voice.duration] - 1) & 255;
    this.bus += bus + ABS_RMW;
  }
}
