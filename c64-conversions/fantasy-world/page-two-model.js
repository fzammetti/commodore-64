import { RASTER_LINES } from './timing.js';

// Native translation of the second page's sprite, character, and text routines.
export class PageTwoModel {
  constructor(memory, io) {
    const ram = new Uint8Array(memory);
    const registers = new Uint8Array(io);
    this.memory = ram.slice(ram.length === 65538 ? 2 : 0);
    this.io = registers.slice(registers.length === 4098 ? 2 : 0);
    if (this.memory.length !== 65536 || this.io.length !== 4096) {
      throw new Error('PageTwoModel requires 64 KiB RAM and the 4 KiB I/O capture.');
    }
    this.frame = 0;
    this.backgroundByRaster = new Uint8Array(RASTER_LINES);
    this.borderByRaster = new Uint8Array(RASTER_LINES);
    this.scrollXByRaster = new Uint8Array(RASTER_LINES);
    this.d016ByRaster = new Uint8Array(RASTER_LINES);
    this.d022ByRaster = new Uint8Array(RASTER_LINES);
    this.d023ByRaster = new Uint8Array(RASTER_LINES);
    this.fontByRaster = new Uint16Array(RASTER_LINES);
    this.characterBaseByRaster = this.fontByRaster;
    this.screenByRaster = new Uint16Array(RASTER_LINES);
    this.screen = new Uint8Array(1000);
    this.scrollRow = new Uint8Array(40);
    this.captureDisplay();
  }

  captureDisplay() {
    const m = this.memory;
    this.screen.set(m.subarray(0x0400, 0x07e8));
    this.scrollRow.set(m.subarray(0x0608, 0x0630));
    this.backgroundByRaster.fill(0);
    this.borderByRaster.fill(0);
    this.d016ByRaster.fill(0xc8);
    this.scrollXByRaster.fill(0);
    this.d022ByRaster.fill(0);
    this.d023ByRaster.fill(0);
    this.fontByRaster.fill(0x3000);
    this.screenByRaster.fill(0x0400);
    // The IRQ starts at raster 152, immediately above the 14th character row.
    // The palette changes once per line through this multicolor text row.
    for (let raster = 155; raster < 163; raster++) {
      const index = raster - 154;
      this.d016ByRaster[raster] = m[0x2752] | 0x10;
      this.scrollXByRaster[raster] = m[0x2752] & 7;
      this.fontByRaster[raster] = 0x0800;
      this.d022ByRaster[raster] = m[0x2753 + index] & 15;
      this.d023ByRaster[raster] = m[0x275d + index] & 15;
    }
  }

  updateSprites() {
    const m = this.memory;
    const io = this.io;
    m[0x0340]++;
    io[0x010] = 0;
    for (let sprite = 0; sprite < 8; sprite++) {
      io[1 + sprite * 2] = m[0x2100 + ((m[0x0340] + sprite * m[0x0341]) & 255)];
    }
    m[0x0342]++;
    m[0x0343] = m[0x2200 + m[0x0340]];
    for (let sprite = 0; sprite < 8; sprite++) {
      const value = m[0x2300 + ((m[0x0342] + sprite * m[0x0341]) & 255)] + m[0x0343];
      if (value > 255) io[0x010] |= m[0x20f0 + sprite * 2];
      io[sprite * 2] = value & 255;
    }
    // The original direction flag becomes 1 permanently on reaching 255.
    if (m[0x2431] === 1) {
      m[0x0342]--;
      if (m[0x0342] === 0) m[0x0342] = 255;
    } else {
      m[0x0342]++;
      if (m[0x0342] === 255) m[0x2431] = 1;
    }
    const first = m[0x35e8];
    for (let index = 0; index < 7; index++) m[0x35e8 + index] = m[0x35e9 + index];
    m[0x35ef] = first;
    for (let index = 0; index < 8; index++) {
      const left = m[0x35e0 + index];
      const right = m[0x35f0 + index];
      m[0x35e0 + index] = ((left << 1) | (left >> 7)) & 255;
      m[0x35f0 + index] = (right >> 1) | ((right & 1) << 7);
    }
    this.io.fill(14, 0xa09, 0xa31);
  }

  updateScroll() {
    const m = this.memory;
    if (m[0x2750] === 1) {
      if (m[0x2751] !== 0) {
        m[0x2751]--;
        return;
      }
      m[0x2750] = 0;
      m[0x2751] = 0;
    }
    if (m[0x27ac] !== 0) m[0x2752]--;
    m[0x2752]--;
    if (m[0x2752] !== 0xbf) return;
    m[0x2752] = 0xc7;
    for (let index = 0; index < 40; index++) m[0x0608 + index] = m[0x0609 + index];
    let pointer = m[0xb0] | (m[0xb1] << 8);
    const value = m[pointer];
    if (value === 0) {
      m[0xb0] = 0;
      m[0xb1] = 0x38;
      return;
    }
    if (value === 0x1e) {
      m[0x27ac] = m[0x27ac] === 0 ? 1 : 0;
    } else if (value === 0x1f) {
      m[0x2750] = 1;
      m[0x2751] = 160;
    } else {
      m[0x062f] = value;
    }
    pointer = (pointer + 1) & 65535;
    m[0xb0] = pointer & 255;
    m[0xb1] = pointer >> 8;
  }

  updatePalettes() {
    const m = this.memory;
    if (m[0x27aa] !== 3) {
      m[0x27aa]++;
    } else {
      m[0x27aa] = 0;
      m[0x27ab] = m[0x2753];
      // Eight copies, then overwrite index seven, exactly as the original.
      for (let index = 0; index < 8; index++) m[0x2753 + index] = m[0x2754 + index];
      m[0x275a] = m[0x27ab];
      m[0x27ab] = m[0x2764];
      for (let index = 6; index >= 0; index--) m[0x275e + index] = m[0x275d + index];
      m[0x275d] = m[0x27ab];
    }
    if (m[0x412b] !== 3) {
      m[0x412b]++;
    } else {
      m[0x412b] = 0;
      m[0x412a] = this.io[0x027];
      for (let sprite = 0; sprite < 7; sprite++) this.io[0x027 + sprite] = this.io[0x028 + sprite];
      this.io[0x02e] = m[0x412a];
    }
  }

  updateFooter() {
    const m = this.memory;
    if (m[0x4053] !== 1) {
      m[0x4053]++;
      return;
    }
    m[0x4053] = 0;
    for (let row = 0; row < 7; row++) {
      this.io.fill(m[0x404b], 0xaa8 + row * 40, 0xad0 + row * 40);
    }
    m[0x404a] = m[0x404b];
    for (let index = 0; index < 8; index++) m[0x404b + index] = m[0x404c + index];
    m[0x4052] = m[0x404a];
  }

  step(mainLoopCalls = 1) {
    this.captureDisplay();
    this.updateSprites();
    this.updateScroll();
    this.updatePalettes();
    for (let call = 0; call < mainLoopCalls; call++) this.updateFooter();
    this.io[0x011] = 0x1b;
    this.io[0x016] = 0xc8;
    this.io[0x018] = 0x1c;
    this.io[0x022] = 0;
    this.io[0x023] = 0;
    this.frame++;
  }
}

