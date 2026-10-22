import { CYCLES_PER_FRAME, CYCLES_PER_LINE, RASTER_LINES } from './timing.js';

// Native translation of the $0B50 part: rotating glyphs, extended-color
// scrolltext, and eight rows separated by a rotating FLD delay pattern.
export class PageFiveModel {
  constructor(ram, io) {
    this.memory = new Uint8Array(ram);
    this.io = new Uint8Array(io);
    this.frame = 0;
    this.mainCycles = 0;
    this.mainOperation = 0;
    this.io[0x11] = 0x1b;
    this.io[0x16] = 0xc8;
    this.io[0x18] = 0xe8;
    this.io[0x15] = this.io[0x20] = this.io[0x21] = 0;
    this.io.fill(0, 0x800, 0xbe8);
    for (const offset of [0, 40, 80, 120, 280, 320, 360, 401]) {
      this.io.fill(1, 0x800 + offset, 0x800 + offset + 40);
    }
    this.memory[0xb0] = 0;
    this.memory[0xb1] = 0x24;
    this.updateRaster();
  }

  step() {
    const m = this.memory;
    // These effects execute in the IRQ after their corresponding display.
    // Capture the current raster state before updating next frame's tables.
    this.updateRaster();
    this.scroll();
    this.everyFour(0x2d58, () => {
      this.rotate(0x2d40, 8, false);
      this.rotate(0x2d48, 8, true);
      this.rotate(0x2d50, 8, false);
    });
    this.everyFour(0x2e6a, () => this.rotate(0x2e2d, 16, false));
    // The foreground loop is not synchronized to the raster. Account for
    // time spent waiting inside the FLD IRQ instead of running it at 60Hz.
    let delayLines = 64;
    for (let row = 0; row < 8; row++) delayLines += this.displayDelays[row];
    this.mainCycles += Math.max(0, CYCLES_PER_FRAME - delayLines * CYCLES_PER_LINE - 3000);
    let cost = this.mainOperation ? 5646 : (m[0xd47] === 1 ? 7142 : 5600);
    while (this.mainCycles >= cost) {
      this.mainCycles -= cost;
      if (this.mainOperation) this.animateColors();
      else this.animateGlyphs();
      this.mainOperation ^= 1;
      cost = this.mainOperation ? 5646 : (m[0xd47] === 1 ? 7142 : 5600);
    }
    this.frame++;
  }

  everyFour(address, operation) {
    if (this.memory[address] === 3) {
      this.memory[address] = 0;
      operation();
    } else this.memory[address]++;
  }

  rotate(address, length, right) {
    const m = this.memory;
    if (right) {
      const last = m[address + length - 1];
      m.copyWithin(address + 1, address, address + length - 1);
      m[address] = last;
    } else {
      const first = m[address];
      m.copyWithin(address, address + 1, address + length);
      m[address + length - 1] = first;
    }
  }

  animateGlyphs() {
    const m = this.memory;
    m[0xd47]++;
    if (m[0xd47] === 2) {
      m[0xd47] = 0;
      for (const address of [0x20d8, 0x20e0, 0x20f8]) {
        for (let row = 0; row < 8; row++) {
          const byte = m[address + row];
          m[address + row] = (byte << 1) | (byte >> 7);
        }
      }
      this.rotate(0x20d8, 8, false);
      this.rotate(0x20e8, 8, true);
      for (let row = 0; row < 8; row++) {
        const byte = m[0x20f0 + row];
        m[0x20f0 + row] = (byte >> 1) | (byte << 7);
      }
    }
    // Twenty-six adjacent custom characters form one 208-pixel strip.
    // Each of its eight pixel rows rotates by a separate stored speed.
    for (let row = 0; row < 8; row++) {
      for (let shift = 0; shift < m[0xd48 + row]; shift++) {
        let carry = 0;
        for (let address = 0x22d0 + row; address >= 0x2208 + row; address -= 8) {
          const byte = m[address];
          m[address] = (byte << 1) | carry;
          carry = byte >> 7;
        }
        if (carry) m[0x22d0 + row] |= 1;
      }
    }
  }

  animateColors() {
    const m = this.memory;
    for (let row = 12; row < 25; row++) {
      this.io.set(m.subarray(0xa5b, 0xa83), 0x800 + row * 40);
    }
    this.rotate(0xa5b, 160, true);
  }

  scroll() {
    const m = this.memory;
    m[0x2d3f]--;
    if (m[0x2d3f] !== 0xbf) return;
    m[0x2d3f] = 0xc7;
    m.copyWithin(0x38c8, 0x38c9, 0x38f1);
    let pointer = m[0xb0] | (m[0xb1] << 8);
    if (!m[pointer]) {
      // Unlike the other parts, the original reset returns without inserting
      // a character, leaving the copied first cell of the next row at right.
      m[0xb0] = 0;
      m[0xb1] = 0x24;
      return;
    }
    m[0x38ef] = m[pointer];
    pointer = (pointer + 1) & 65535;
    m[0xb0] = pointer & 255;
    m[0xb1] = pointer >> 8;
  }

  updateRaster() {
    const m = this.memory;
    this.screenMemory = m.slice(0x3800, 0x3be8);
    this.fontByRaster = new Uint16Array(RASTER_LINES).fill(0x2000);
    this.d011ByRaster = new Uint8Array(RASTER_LINES).fill(0x1b);
    this.d016ByRaster = new Uint8Array(RASTER_LINES).fill(0xc8);
    this.d022ByRaster = new Uint8Array(RASTER_LINES);
    this.d023ByRaster = new Uint8Array(RASTER_LINES);
    this.d024ByRaster = new Uint8Array(RASTER_LINES);
    this.borderByRaster = new Uint8Array(RASTER_LINES);
    this.sourceYByRaster = Int16Array.from({ length: RASTER_LINES }, (_, line) => line - 51);
    this.displayDelays = m.slice(0x2e2d, 0x2e35);
    this.fontByRaster.fill(0x3000, 89, 101);
    this.d011ByRaster.fill(0x5b, 89, 101);
    this.d016ByRaster.fill(m[0x2d3f], 89, 101);
    for (let line = 89; line < 101; line++) {
      const stripe = Math.min(7, Math.floor((line - 89) * CYCLES_PER_LINE / 93));
      this.d022ByRaster[line] = m[0x2d40 + stripe];
      this.d023ByRaster[line] = m[0x2d48 + stripe];
      this.d024ByRaster[line] = m[0x2d50 + stripe];
    }
    let raster = 131;
    for (let band = 0; band < 8; band++) {
      const delay = this.displayDelays[band];
      const color = m[0x2e6c + band];
      for (let line = 0; line < delay && raster < RASTER_LINES; line++, raster++) {
        this.sourceYByRaster[raster] = -1;
        this.borderByRaster[raster] = color;
        this.d011ByRaster[raster] = 0x13 | (raster & 7);
      }
      for (let line = 0; line < 8 && raster < RASTER_LINES; line++, raster++) {
        this.sourceYByRaster[raster] = 80 + band * 8 + line;
        this.borderByRaster[raster] = color;
      }
    }
    for (let line = raster; line < RASTER_LINES; line++) {
      this.sourceYByRaster[line] = 144 + line - raster;
    }
  }
}
