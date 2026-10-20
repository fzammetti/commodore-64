import { RASTER_LINES } from './timing.js';

/** Native translation of page three's sprite-scroller IRQ, $4075 through $557b. */
export class PageThreeModel {
  constructor(memory, io) {
    this.memory = memory.length === 65538 ? memory.subarray(2) : memory;
    this.io = io.length === 4098 ? io.subarray(2) : io;
    this.frame = 0;
    this.backgroundByRaster = new Uint8Array(RASTER_LINES).fill(this.io[0x21] & 15);
    this.borderByRaster = new Uint8Array(RASTER_LINES).fill(this.io[0x20] & 15);
    this.scrollXByRaster = new Uint8Array(RASTER_LINES).fill(this.io[0x16] & 7);
    this.d016ByRaster = new Uint8Array(RASTER_LINES).fill(this.io[0x16]);
    this.characterBaseByRaster = new Uint16Array(RASTER_LINES).fill((this.io[0x18] & 14) << 10);
    this.screenBaseByRaster = new Uint16Array(RASTER_LINES).fill((this.io[0x18] & 0xf0) << 6);
    this.bitmapBaseByRaster = new Uint16Array(RASTER_LINES).fill((this.io[0x18] & 8) << 10);
    this.fontByRaster = this.characterBaseByRaster;
    this.screenByRaster = this.screenBaseByRaster;
  }

  swapPointers() {
    const m = this.memory;
    const low = m[0xb0];
    const high = m[0xb1];
    m[0xb0] = m[0x4196];
    m[0xb1] = m[0x4197];
    m[0x4196] = low;
    m[0x4197] = high;
  }

  fetchCharacters() {
    const m = this.memory;
    this.swapPointers();
    m[0xb0] = m[0x4190];
    m[0xb1] = m[0x4191];
    for (let index = 0; index < 3; index++) {
      const pointer = m[0xb0] | (m[0xb1] << 8);
      const character = m[pointer];
      if (character === 0) {
        m[0x4190] = 0;
        m[0x4191] = 0x42;
        break;
      }
      m[0x4192 + index] = character;
      const next = (pointer + 1) & 0xffff;
      m[0xb0] = next & 255;
      m[0xb1] = next >> 8;
      if (index === 2) {
        m[0x4190] = m[0xb0];
        m[0x4191] = m[0xb1];
      }
    }
    for (let index = 0; index < 3; index++) {
      const glyph = 0x1000 + m[0x4192 + index] * 8;
      m[0xb0] = glyph & 255;
      m[0xb1] = glyph >> 8;
      for (let row = 0; row < 8; row++) {
        m[0x09c0 + m[0x4195] + row * 3] = m[glyph + row];
      }
      m[0x4195]++;
    }
    m[0x4195] = 0;
    this.swapPointers();
  }

  step() {
    const m = this.memory;
    const io = this.io;
    // CPX at the end of each row clears carry until the final row is complete.
    for (let row = 0; row < 8; row++) {
      let carry = 0;
      for (let sprite = 7; sprite >= 0; sprite--) {
        for (let column = 2; column >= 0; column--) {
          const address = 0x0800 + sprite * 64 + row * 3 + column;
          const value = m[address];
          m[address] = ((value << 1) | carry) & 255;
          carry = value >> 7;
        }
      }
    }
    m[0x4096]++;
    if (m[0x4096] === 24) {
      m[0x4096] = 0;
      this.fetchCharacters();
    }

    // $5545 is the saved first color, so the visible ten colors rotate.
    if (m[0x5546] === 5) {
      m[0x5546] = 0;
      for (let sprite = 0; sprite < 7; sprite++) io[0x27 + sprite] = m[0x553b];
      m[0x5545] = m[0x553b];
      for (let index = 0; index < 11; index++) m[0x553b + index] = m[0x553c + index];
    } else {
      m[0x5546]++;
    }

    // The original LDY #$10 / INY / CPY #$10 really shifts 256 bytes.
    // Its scratch $5580 remains outside the shifted range; 15 active Y values rotate.
    for (let sprite = 0; sprite < 7; sprite++) io[1 + sprite * 2] = m[0x55a0];
    m[0x5580] = m[0x55a0];
    let index = 16;
    do {
      m[0x55a0 + index] = m[0x55a1 + index];
      index = (index + 1) & 255;
    } while (index !== 16);
    m[0x55ae] = m[0x5580];
    this.frame++;
  }
}

