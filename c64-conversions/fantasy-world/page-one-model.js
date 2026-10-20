import { RASTER_LINES } from './timing.js';

/**
 * The $1800 presentation, translated from its $1b24 raster interrupt.
 * Screen and character bytes remain the original assets; this class reproduces
 * only the counters, raster colours, and screen-bank selection.
 */
export class PageOneModel {
  constructor(memory, io) {
    this.memory = memory;
    this.io = io;
    this.frame = 0;
    this.backgroundByRaster = new Uint8Array(RASTER_LINES);
    this.borderByRaster = new Uint8Array(RASTER_LINES);
    this.scrollXByRaster = new Uint8Array(RASTER_LINES);
    this.characterBaseByRaster = new Uint16Array(RASTER_LINES);
    this.screenBaseByRaster = new Uint16Array(RASTER_LINES);
    this.characterBaseByRaster.fill(0x0800);
    this.scrollXByRaster.fill(io[0x16] & 7);
    this.screenBaseByRaster.fill((io[0x18] & 0xf0) << 6);
  }

  step() {
    const m = this.memory;
    const io = this.io;
    this.frame++;
    this.backgroundByRaster.fill(0);
    this.borderByRaster.fill(0);
    this.screenBaseByRaster.fill((io[0x18] & 0xf0) << 6);

    // $1b24 waits for each actual raster, repeating eight table entries.
    for (let raster = 52; raster < 251; raster++) {
      this.borderByRaster[raster] = m[0x1b52 + ((raster - 52) & 7)] & 15;
    }

    // The captured setup starts at one: its first rotation is the second IRQ.
    if (m[0x1b9f] !== 2) {
      m[0x1b9f] = (m[0x1b9f] + 1) & 255;
      return;
    }
    m[0x1b9f] = 0;
    const first = m[0x1b52];
    m[0x1b9e] = first;
    m.copyWithin(0x1b52, 0x1b53, 0x1b72);
    m[0x1b71] = first;

    // $1a00 runs only when that table rotates: one screen per 387 NTSC frames.
    if (m[0x1aa2] !== 0x80) {
      m[0x1aa2] = (m[0x1aa2] + 1) & 255;
      return;
    }
    m[0x1aa2] = 0;
    if (m[0x1aa1] === 9 || m[0x1aa1] < 1 || m[0x1aa1] > 8) m[0x1aa1] = 1;
    const state = m[0x1aa1];
    if (state === 8) {
      // This surprising $0400 destination is present in the original $1a8f.
      m[0x0400] = 0xf2;
    } else {
      io[0x18] = 0x72 + state * 0x10;
    }
    m[0x1aa1]++;
    // The register changes after the visible text region, below raster 250.
    this.screenBaseByRaster.fill((io[0x18] & 0xf0) << 6, 251);
  }
}

