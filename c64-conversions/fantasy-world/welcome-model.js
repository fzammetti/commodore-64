import { RASTER_LINES } from './timing.js';

// Native translation of the welcome page's two raster interrupts ($142c and $1524).
// The original bytes, including self-modifying counters, remain the state of the model.
export class WelcomeModel {
  constructor(memory, io) {
    const ram = new Uint8Array(memory);
    const registers = new Uint8Array(io);
    this.memory = ram.slice(ram.length === 65538 ? 2 : 0);
    this.io = registers.slice(registers.length === 4098 ? 2 : 0);
    if (this.memory.length !== 65536 || this.io.length !== 4096) {
      throw new Error('WelcomeModel requires 64 KiB RAM and the 4 KiB I/O capture.');
    }
    this.frame = 0;
    this.backgroundByRaster = new Uint8Array(RASTER_LINES);
    this.scrollXByRaster = new Uint8Array(RASTER_LINES);
    this.d016ByRaster = new Uint8Array(RASTER_LINES);
    this.fontByRaster = new Uint16Array(RASTER_LINES);
    this.screenByRaster = new Uint16Array(RASTER_LINES);
    this.screen = new Uint8Array(1000);
    this.scrollRow = new Uint8Array(40);
    this.captureDisplay();
  }

  captureDisplay() {
    const m = this.memory;
    this.screen.set(m.subarray(0x0400, 0x07e8));
    this.scrollRow.set(m.subarray(0x07c0, 0x07e8));
    this.backgroundByRaster.fill(0);
    this.scrollXByRaster.fill(0);
    this.d016ByRaster.fill(0xc8);
    this.fontByRaster.fill(0x0800);
    this.screenByRaster.fill(0x0400);
    for (let raster = 50; raster < 204; raster++) {
      const index = (raster - 50) % 24;
      this.backgroundByRaster[raster] = m[0x1462 + index] & 15;
      this.d016ByRaster[raster] = m[0x14cd + index];
      this.scrollXByRaster[raster] = m[0x14cd + index] & 7;
    }
    // The bottom IRQ makes eight timed background writes around raster 242.
    // These are raster positions rather than a cycle-exact VIC simulation.
    for (let index = 0; index < 8; index++) {
      const raster = 242 + index;
      this.backgroundByRaster[raster] = m[0x15a1 + index] & 15;
      this.d016ByRaster[raster] = m[0x15a0];
      this.scrollXByRaster[raster] = m[0x15a0] & 7;
    }
  }

  step() {
    const m = this.memory;
    this.captureDisplay();

    // $147a: rotate the 24-color and horizontal-wave tables every third frame.
    if (m[0x14e6] !== 2) {
      m[0x14e6]++;
    } else {
      m[0x14e6] = 0;
      m[0x14e5] = m[0x1462];
      for (let index = 0; index < 24; index++) m[0x1462 + index] = m[0x1463 + index];
      m[0x1479] = m[0x14e5];
      if (m[0x14e7] !== 0) {
        m[0x14e7]++;
      } else {
        // The original shifts through $14e5, which doubles as the scratch byte.
        for (let index = 23; index >= 0; index--) m[0x14ce + index] = m[0x14cd + index];
        m[0x14cd] = m[0x14e5];
      }
    }

    // $1564: move the final text row left one pixel; fetch a character every eight frames.
    m[0x15a0]--;
    if (m[0x15a0] === 0xbf) {
      m[0x15a0] = 0xc7;
      for (let index = 0; index < 40; index++) m[0x07c0 + index] = m[0x07c1 + index];
      let pointer = m[0xb0] | (m[0xb1] << 8);
      const character = m[pointer];
      if (character === 0) {
        m[0xb0] = 0;
        m[0xb1] = 0x10;
      } else {
        m[0x07e7] = character;
        pointer = (pointer + 1) & 0xffff;
        m[0xb0] = pointer & 255;
        m[0xb1] = pointer >> 8;
      }
    }

    // $15b1: the separate 16-color scroller band rotates every fourth frame.
    if (m[0x15dc] !== 3) {
      m[0x15dc]++;
    } else {
      m[0x15dc] = 0;
      m[0x15db] = m[0x15a1];
      for (let index = 0; index < 16; index++) m[0x15a1 + index] = m[0x15a2 + index];
      m[0x15b0] = m[0x15db];
    }

    this.io[0x016] = 0xc8;
    this.io[0x021] = 0;
    this.frame++;
  }
}

