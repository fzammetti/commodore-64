import { CYCLES_PER_LINE, RASTER_LINES } from './timing.js';

function capture(input, size, name) {
  const bytes = new Uint8Array(input);
  if (bytes.length !== size) throw new Error(`${name} must contain ${size} bytes.`);
  return bytes.slice();
}

// Native translation of $1865..$1B49. The raster schedule is the original
// instruction durations, with NTSC's 65 cycles per line and 40-cycle bad lines.
// It is a display-event schedule, rather than an executing 6502 in the browser.
export class PageThreeModel {
  constructor(memory, io, { irqEntryCycles = 38, rasterSampleCycle = 17 } = {}) {
    this.memory = capture(memory, 65536, 'RAM');
    this.io = capture(io, 4096, 'I/O');
    this.frame = 0;
    this.irqEntryCycles = irqEntryCycles;
    this.rasterSampleCycle = rasterSampleCycle;
    this.d016ByRaster = new Uint8Array(RASTER_LINES);
    this.multicolor1ByRaster = new Uint8Array(RASTER_LINES);
    this.multicolor2ByRaster = new Uint8Array(RASTER_LINES);
    this.previousScrollerMemory = this.memory.slice(0x05e0, 0x0608);
    this.previousScrollerColor = this.io[0x9e0];
    this.buildRasterFrame();
  }

  // $194D rotates the first 64-byte palette left and the second right.
  rotatePalettes() {
    const memory = this.memory;
    const first = memory[0x18cd];
    memory.copyWithin(0x18cd, 0x18ce, 0x190e);
    memory[0x190c] = first;
    const last = memory[0x194c];
    memory.copyWithin(0x190e, 0x190d, 0x194c);
    memory[0x190d] = last;
    memory[0x1980] = last;
  }

  // $19D7: one fine-scroll pixel per IRQ; a character enters every eight IRQs.
  scrollCharacters() {
    const memory = this.memory;
    memory[0x1a15] = (memory[0x1a15] - 1) & 255;
    if (memory[0x1a15] !== 0xbf) return;
    memory[0x1a15] = 0xc7;
    memory.copyWithin(0x05e0, 0x05e1, 0x0609);
    let pointer = memory[0xb0] | memory[0xb1] << 8;
    if (memory[pointer] === 0) pointer = 0x1c00;
    memory[0x0607] = memory[pointer];
    pointer = (pointer + 1) & 65535;
    memory[0xb0] = pointer & 255;
    memory[0xb1] = pointer >> 8;
  }

  buildRasterFrame() {
    const events = this.rasterWrites = [];
    const memory = this.memory;
    let clock = 0;
    // VIC bad lines steal cycles 15..54, numbered from one. Keeping this
    // explicit also preserves the PAL-written loop's drift under NTSC timing.
    const advance = count => {
      while (count > 0) {
        const line = Math.floor(clock / CYCLES_PER_LINE);
        const cycle = clock % CYCLES_PER_LINE;
        const badLine = line >= 48 && line <= 247 && (line & 7) === (this.io[0x11] & 7);
        if (badLine && cycle >= 14 && cycle < 54) {
          clock += 54 - cycle;
          continue;
        }
        const available = (badLine && cycle < 14 ? 14 : CYCLES_PER_LINE) - cycle;
        const elapsed = Math.min(count, available);
        clock += elapsed;
        count -= elapsed;
      }
    };
    const write = (register, value) => events.push({ cycle: clock, register, value: value & 255 });
    const stripe = raster => {
      clock = raster * CYCLES_PER_LINE + this.irqEntryCycles;
      advance(26); write(0x22, memory[0x18cd]);
      advance(8); write(0x23, memory[0x190d]);
      advance(10); write(0x16, 0xd8);
      advance(22);
      for (let index = 1; index < 64; index++) {
        advance(8 + (index >= 51 ? 1 : 0)); write(0x22, memory[0x18cd + index]);
        advance(8); write(0x23, memory[0x190d + index]);
        advance(10); write(0x16, 0xd8);
        advance(index === 63 ? 35 : 36);
      }
      advance(34); write(0x22, 0);
      advance(4); write(0x23, 0);
      advance(6); write(0x16, 0xc8);
    };
    stripe(64);
    clock = 146 * CYCLES_PER_LINE + this.irqEntryCycles;
    advance(21); write(0x16, memory[0x1a15]);
    advance(509); write(0x16, 0xc8);
    stripe(168);
    events.sort((left, right) => left.cycle - right.cycle);
    let event = 0, d016 = 0xc8, color1 = 0, color2 = 0;
    for (let line = 0; line < RASTER_LINES; line++) {
      const sample = line * CYCLES_PER_LINE + this.rasterSampleCycle;
      while (event < events.length && events[event].cycle <= sample) {
        const { register, value } = events[event++];
        if (register === 0x16) d016 = value;
        else if (register === 0x22) color1 = value;
        else if (register === 0x23) color2 = value;
      }
      this.d016ByRaster[line] = d016;
      this.multicolor1ByRaster[line] = color1;
      this.multicolor2ByRaster[line] = color2;
    }
  }

  step() {
    this.previousScrollerMemory.set(this.memory.subarray(0x05e0, 0x0608));
    this.previousScrollerColor = this.io[0x9e0];
    this.buildRasterFrame();
    // $1B08 clears two overlapping 40-byte spans, hence 79 bytes in total.
    this.io.fill(0, 0x800, 0x84f);
    this.scrollCharacters();
    this.memory[0x1864] = (this.memory[0x1864] + 1) & 255;
    if (this.memory[0x1864] === 3) {
      this.memory[0x1864] = 0;
      this.rotatePalettes();
    }
    this.io.fill(this.memory[0x18cd], 0x9e0, 0xa08);
    this.io[0x16] = 0xc8;
    this.io[0x22] = 0;
    this.io[0x23] = 0;
    this.frame++;
  }
}
