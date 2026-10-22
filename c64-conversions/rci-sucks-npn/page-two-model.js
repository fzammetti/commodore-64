import { CYCLES_PER_LINE, RASTER_LINES } from './timing.js';

// Translation of the $1800 section. The 6502 code is retained as evidence in
// analysis/page2.ram; animation uses these recovered operations directly.
export class PageTwoModel {
  constructor(ram, io = new Uint8Array(4096)) {
    this.memory = new Uint8Array(ram);
    this.io = new Uint8Array(io);
    this.frame = 0;
    this.pattern = 1;
    this.io[0x11] = 0x1b;
    this.io[0x16] = 0xc8;
    this.io[0x18] = 0x12;
    this.io[0x20] = this.io[0x21] = 0;
    this.io[0x15] = 255;
    // The original loop stops at X=$FF and leaves the last byte of each
    // color-RAM page untouched. CHROUT $13 homes the cursor, preserving RAM.
    for (let page = 0; page < 4; page++) this.io.fill(0, 0x800 + page * 256, 0x8ff + page * 256);
    for (let sprite = 0; sprite < 8; sprite++) this.memory[0x7f8 + sprite] = 0xd7 - sprite;
    this.scrollSmall();
    this.scrollLarge();
    this.updateRaster();
  }

  setPattern(pattern) {
    if (Number.isInteger(pattern) && pattern >= 1 && pattern <= 5) {
      this.pattern = pattern;
      this.memory[0x1a3b] = pattern;
    }
  }

  step() {
    this.rotateEveryFour(0x1af5, () => {
      this.rotateLeft(0x1b65, 24);
      this.rotateRight(0x1bc4, 32);
    });
    this.rotateEveryFour(0x1da1, () => {
      this.rotateLeft(0x1d91, 8);
      this.rotateRight(0x1d99, 8);
    });
    this.moveSprites();
    this.scrollSmall();
    this.scrollLarge();
    this.rotateEveryFour(0x1e0d, () => {
      this.io.fill(this.memory[0x1e6b], 0x8f0, 0x918);
      this.io.fill(this.memory[0x1e73], 0xb20, 0xb48);
      this.rotateLeft(0x1e6b, 8);
      this.rotateLeft(0x1e73, 8);
    });
    this.frame++;
    this.updateRaster();
  }

  rotateEveryFour(address, operation) {
    if (this.memory[address] === 3) {
      this.memory[address] = 0;
      operation();
    } else this.memory[address]++;
  }

  rotateLeft(address, length) {
    const first = this.memory[address];
    this.memory.copyWithin(address, address + 1, address + length);
    this.memory[address + length - 1] = first;
  }

  rotateRight(address, length) {
    const last = this.memory[address + length - 1];
    this.memory.copyWithin(address + 1, address, address + length - 1);
    this.memory[address] = last;
  }

  moveSprites() {
    const m = this.memory, io = this.io;
    const base = 0x2000 + (this.pattern - 1) * 0x400;
    for (let sprite = 0; sprite < 8; sprite++) {
      // Each ADC clears carry. The carry from the first X addition is
      // deliberately discarded before adding the X origin.
      const xSum = (m[base + 0x100 + m[base + 0x9d]] + m[base + 0x100 + m[base + 0x9e]]) & 255;
      const x = xSum + m[base + 0x97];
      io[sprite * 2] = x & 255;
      io[0x10] = (io[0x10] >> 1) | (x > 255 ? 128 : 0);
      let y = ((m[base + 0x100 + m[base + 0x9f]] >> 1)
        + m[base + 0x100 + m[base + 0xa0]]) & 255;
      // Pattern 1 has a NOP at $205C; the other four have LSR A.
      if (this.pattern !== 1) y >>= 1;
      io[sprite * 2 + 1] = (y + m[base + 0x98]) & 255;
      for (let phase = 0; phase < 4; phase++) m[base + 0x9d + phase] += m[base + 0x93 + phase];
    }
    for (let phase = 0; phase < 4; phase++) {
      m[base + 0x99 + phase] += m[base + 0x8f + phase];
      m[base + 0x9d + phase] = m[base + 0x99 + phase];
    }
  }

  readScrollCharacter(pointer, restart) {
    const m = this.memory;
    let address = m[pointer] | (m[pointer + 1] << 8);
    if (!m[address]) address = restart;
    const character = m[address];
    address = (address + 1) & 65535;
    m[pointer] = address & 255;
    m[pointer + 1] = address >> 8;
    return character;
  }

  scrollSmall() {
    const m = this.memory;
    m[0x1c8e]--;
    if (m[0x1c8e] !== 0xbf) return;
    m[0x1c8e] = 0xc7;
    // The source includes the next row's first cell, then the last cell is
    // replaced with the next scrolltext character, exactly as at $1C52.
    m.copyWithin(0x720, 0x721, 0x749);
    m[0x747] = this.readScrollCharacter(0x1e09, 0x4400);
  }

  scrollLarge() {
    const m = this.memory;
    m[0x1d90] -= 2;
    if (m[0x1d90] !== 0xbf) return;
    m[0x1d90] = 0xc7;
    m.copyWithin(0x798, 0x799, 0x7c1);
    m.copyWithin(0x7c0, 0x7c1, 0x7e9);
    const character = this.readScrollCharacter(0x1e0b, 0x4000);
    m[0x7bf] = character === 0x20 ? 0xa0 : character;
    m[0x7e7] = (character + 0x80) & 255;
  }

  updateRaster() {
    const m = this.memory;
    this.fontByRaster = new Uint16Array(RASTER_LINES).fill(0x800);
    this.fontByRaster.fill(0x3800, 232, 251);
    this.rasterWrites = [];
    const write = (clock, register, value) => this.rasterWrites.push({ clock, register, value });
    write(0, 0x16, 0xc8);
    write(0, 0x20, 0);
    write(0, 0x21, 0);
    // Timed color-bar loops use 72 CPU cycles per stripe, which is wider
    // than a 65-cycle NTSC scanline. Do not snap them to PAL line timing.
    let clock = 170 * CYCLES_PER_LINE + 58;
    for (let stripe = 0; stripe < 24; stripe++) {
      write(clock, 0x21, m[0x1b65 + stripe]);
      write(clock + 8, 0x16, m[0x1bc4 + stripe]);
      clock += stripe === 0 ? 57 : 72;
    }
    write(clock + 35, 0x21, 0);
    write(clock + 55, 0x16, 0xc8);
    write(210 * CYCLES_PER_LINE + 58, 0x16, m[0x1c8e]);
    write(219 * CYCLES_PER_LINE, 0x16, 0xc8);
    clock = 232 * CYCLES_PER_LINE + 58;
    write(clock + 8, 0x16, m[0x1d90]);
    for (let stripe = 0; stripe < 16; stripe++) {
      write(clock, 0x21, m[0x1d91 + stripe]);
      clock += stripe === 0 ? 64 : 69;
    }
    write(clock + 3, 0x21, 0);
    write(clock + 15, 0x16, 0xc8);
    this.rasterWrites.sort((left, right) => left.clock - right.clock);
  }
}
