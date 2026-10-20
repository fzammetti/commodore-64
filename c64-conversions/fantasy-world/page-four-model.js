import { RASTER_LINES } from './timing.js';

// Native reconstruction of the final "Miracle Page" raster and character animation.
export class PageFourModel {
  constructor(memory, io) {
    const ram = new Uint8Array(memory);
    const registers = new Uint8Array(io);
    this.memory = ram.slice(ram.length === 65538 ? 2 : 0);
    this.io = registers.slice(registers.length === 4098 ? 2 : 0);
    this.frame = 0;
    this.animationFrame = 0;
    this.animationWait = 0;
    this.backgroundByRaster = new Uint8Array(RASTER_LINES);
    this.borderByRaster = new Uint8Array(RASTER_LINES);
    this.scrollXByRaster = new Uint8Array(RASTER_LINES);
    this.d016ByRaster = new Uint8Array(RASTER_LINES);
    this.fontByRaster = new Uint16Array(RASTER_LINES).fill(0x2000);
    this.screenByRaster = new Uint16Array(RASTER_LINES).fill(0x0400);
    this.sourceYByRaster = new Uint16Array(RASTER_LINES);
    this.screen = new Uint8Array(1000);
    this.captureDisplay();
  }

  captureDisplay() {
    const m = this.memory;
    this.screen.set(m.subarray(0x0400, 0x07e8));
    this.backgroundByRaster.fill(0);
    this.borderByRaster.fill(0);
    this.d016ByRaster.fill(0xd8);
    this.scrollXByRaster.fill(0);
    this.sourceYByRaster.fill(65535);
    let raster = 51;
    let border = 0;
    let inserted = 0;
    for (let row = 0; row < 8; row++) {
      const delay = m[0x1cba + row];
      const control = m[0x1cfb + row] | 0x10;
      for (let line = 0; line < delay + 8; line++, raster++) {
        this.borderByRaster[raster] = border;
        this.d016ByRaster[raster] = control;
        this.scrollXByRaster[raster] = control & 7;
        if (line >= delay) this.sourceYByRaster[raster] = row * 8 + line - delay;
      }
      inserted += delay;
      border = m[0x1cf3 + row] & 15;
    }
    for (; raster <= 250; raster++) this.sourceYByRaster[raster] = raster - 51 - inserted;
    // This lower interrupt combines border raster bars with a moving character row.
    for (let line = 0; line < 24; line++) {
      const raster = 219 + line;
      this.borderByRaster[raster] = m[0x1e17 + line] & 15;
      this.d016ByRaster[raster] = m[0x1e16];
      this.scrollXByRaster[raster] = m[0x1e16] & 7;
    }
  }

  animateCharacters() {
    const m = this.memory;
    const pointerAt = 0x2f00 + this.animationFrame * 2;
    const source = (m[pointerAt] << 8) | m[pointerAt + 1];
    m[0x2b09] = source & 255;
    m[0x2b0a] = source >> 8;
    for (let index = 0; index < 32; index++) m[0x2208 + index] = m[source + index];
    const rotateLeft = (address, length) => {
      const first = m[address];
      for (let index = 0; index < length - 1; index++) m[address + index] = m[address + index + 1];
      m[address + length - 1] = first;
    };
    const rotateRight = (address, length) => {
      const last = m[address + length - 1];
      for (let index = length - 2; index >= 0; index--) m[address + index + 1] = m[address + index];
      m[address] = last;
    };
    rotateLeft(0x2230, 32);
    rotateRight(0x2250, 32);
    rotateRight(0x2228, 8);
    rotateLeft(0x2270, 32);
    rotateRight(0x2290, 32);
    for (let index = 0; index < 8; index++) {
      const left = m[0x22b0 + index];
      const right = m[0x22b8 + index];
      m[0x22b0 + index] = ((left << 1) | (left >> 7)) & 255;
      m[0x22b8 + index] = (right >> 1) | ((right & 1) << 7);
    }
    this.animationFrame = (this.animationFrame + 1) % 40;
    m[0xa2] = 0;
  }

  updateScroll() {
    const m = this.memory;
    m[0x1e16]--;
    if (m[0x1e16] !== 0xbf) return;
    m[0x1e16] = 0xc7;
    for (let index = 0; index < 40; index++) m[0x0720 + index] = m[0x0721 + index];
    let pointer = m[0xb0] | (m[0xb1] << 8);
    const character = m[pointer];
    if (character === 0) {
      m[0xb0] = 0;
      m[0xb1] = 0x46;
    } else {
      m[0x0747] = character;
      pointer = (pointer + 1) & 65535;
      m[0xb0] = pointer & 255;
      m[0xb1] = pointer >> 8;
    }
  }

  updatePalettes() {
    const m = this.memory;
    if (m[0x1cf1] !== 4) {
      m[0x1cf1]++;
    } else {
      m[0x1cf1] = 0;
      m[0x1cf2] = m[0x1cba];
      for (let index = 0; index < 8; index++) m[0x1cba + index] = m[0x1cbb + index];
      m[0x1cc1] = m[0x1cf2];
      m[0x1cf2] = m[0x1cfb];
      for (let index = 0; index < 14; index++) m[0x1cfb + index] = m[0x1cfc + index];
      m[0x1d08] = m[0x1cf2];
    }
    if (m[0x1e5b] !== 1) {
      m[0x1e5b]++;
    } else {
      m[0x1e5b] = 0;
      m[0x1cf2] = m[0x1e17];
      for (let index = 0; index < 24; index++) m[0x1e17 + index] = m[0x1e18 + index];
      m[0x1e2e] = m[0x1cf2];
      this.io.fill(m[0x1d6f], 0xb20, 0xb48);
      m[0x1cf2] = m[0x1d6f];
      for (let index = 0; index < 9; index++) m[0x1d6f + index] = m[0x1d70 + index];
      m[0x1d77] = m[0x1cf2];
    }
  }

  step() {
    if (this.animationWait === 0) {
      this.animateCharacters();
      this.animationWait = 3;
    }
    this.captureDisplay();
    this.updateScroll();
    this.updatePalettes();
    this.animationWait--;
    this.memory[0xa2]++;
    this.io[0x011] = 0x1b;
    this.io[0x016] = 0xc8;
    this.frame++;
  }
}

