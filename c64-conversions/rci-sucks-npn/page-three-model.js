import { CYCLES_PER_LINE, RASTER_LINES } from './timing.js';

/**
 * Native translation of the $1a00 bitmap/text part. Its RAM and music now come
 * directly from the working replacement PRG, without relocating damaged data.
 */
export class PageThreeModel {
  constructor(memory, io) {
    this.memory = new Uint8Array(memory).slice();
    this.io = new Uint8Array(io).slice();
    if (this.memory.length !== 65536 || this.io.length !== 4096) {
      throw new Error('PageThreeModel requires 64 KiB RAM and 4 KiB I/O.');
    }
    this.frame = 0;
    this.backgroundByRaster = new Uint8Array(RASTER_LINES);
    this.borderByRaster = new Uint8Array(RASTER_LINES);
    this.d016ByRaster = new Uint8Array(RASTER_LINES);
    this.d011ByRaster = new Uint8Array(RASTER_LINES);
    this.fontByRaster = new Uint16Array(RASTER_LINES).fill(0x0800);
    this.screenByRaster = new Uint16Array(RASTER_LINES).fill(0x0400);
    this.bitmapBaseByRaster = new Uint16Array(RASTER_LINES).fill(0x2000);
    this.sourceYByRaster = new Uint16Array(RASTER_LINES).fill(65535);
    this.rasterWrites = [];

    this.io[0x11] = 0x1b;
    this.io[0x16] = 0xc8;
    this.io[0x18] = 0x12;
    this.io[0x15] = 0;
    this.io[0x20] = 0;
    this.io[0x21] = 0;
    this.io[0xd00] = (this.io[0xd00] & 0xfc) | 3;
    this.io.fill(0, 0x800, 0xbe8);
    this.memory.fill(0xcf, 0x0400, 0x07e8);
    this.memory.copyWithin(0x06d0, 0x36d0, 0x37c0);
    this.memory.fill(0x20, 0x0658, 0x0680);
    this.memory[0xb0] = 0;
    this.memory[0xb1] = 0x38;
    this.memory[0x1b4d] = 0xc7;
    this.memory[0x1b99] = 0;
    this.memory[0x1bc3] = 0;
    this.fetchCharacter();
    this.captureRasters();
  }

  // $1afd: screen codes use the high half of the recovered $0800 font.
  fetchCharacter() {
    const m = this.memory;
    let pointer = m[0xb0] | (m[0xb1] << 8);
    if (m[pointer] === 0) pointer = 0x3800;
    m[0x067f] = (m[pointer] + 0x80) & 255;
    pointer++;
    m[0xb0] = pointer & 255;
    m[0xb1] = pointer >> 8;
  }

  // $1ae0: one fine-scroll decrement per frame, then a forty-cell shift.
  scrollText() {
    const m = this.memory;
    m[0x1b4d]--;
    if (m[0x1b4d] !== 0xbf) return;
    m[0x1b4d] = 0xc7;
    m.copyWithin(0x0658, 0x0659, 0x0681);
    this.fetchCharacter();
  }

  // $1b6e/$1c35 rotate the two original 32-entry palettes in opposite directions.
  rotatePalettes() {
    const m = this.memory;
    if (m[0x1b99] !== 3) {
      m[0x1b99]++;
    } else {
      m[0x1b99] = 0;
      m[0x1b98] = m[0x1b4e];
      m.copyWithin(0x1b4e, 0x1b4f, 0x1b6f);
      m[0x1b6d] = m[0x1b98];
    }
    m[0x1bc3]++;
    if (m[0x1bc3] === 3) {
      m[0x1bc3] = 0;
      m[0x1b98] = m[0x1c34];
      m.copyWithin(0x1c16, 0x1c15, 0x1c34);
      m[0x1c15] = m[0x1b98];
    }
  }

  captureRasters() {
    const m = this.memory;
    this.backgroundByRaster.fill(0);
    this.borderByRaster.fill(0);
    this.d016ByRaster.fill(0xc8);
    this.d011ByRaster.fill(0x1b);
    this.d011ByRaster.fill(0x36, 48, 169);
    this.d016ByRaster.fill(m[0x1b4d], 179, 187);
    this.screenMemory = m.slice(0x0400, 0x07e8);

    // Changing vertical scroll from six to three at raster 169 causes an early
    // badline at 171. VIC reloads row fourteen before advancing to the scroller.
    for (let raster = 54; raster < 251; raster++) {
      this.sourceYByRaster[raster] = raster < 171 ? raster - 54 : raster - 59;
    }

    // NTSC VICE measurements of $1AAF/$1AC0: the badline at raster 179
    // adds 43 cycles (40 fetch cycles plus BA lead-in) before color two. Subsequent
    // stores are 65 cycles apart, so each scroller row has one solid color.
    const events = [];
    const write = (clock, register, value) => events.push({ clock, register, value });
    let clock = 178 * CYCLES_PER_LINE + 58;
    write(clock, 0x21, m[0x1b4e]);
    write(clock + 8, 0x16, m[0x1b4d]);
    clock = 180 * CYCLES_PER_LINE + 12;
    for (let index = 1; index < 8; index++, clock += 65) write(clock, 0x21, m[0x1b4e + index]);
    clock = 187 * CYCLES_PER_LINE + 9;
    write(clock, 0x21, 0);
    write(clock + 6, 0x16, 0xc8);

    clock = 218 * CYCLES_PER_LINE + 67;
    write(clock, 0x21, m[0x1c15]);
    clock += 40;
    for (let index = 1; index < 32; index++, clock += 60) write(clock, 0x21, m[0x1c15 + index]);
    write(clock + 10, 0x21, 0);
    this.rasterWrites = events;
  }

  step() {
    this.frame++;
    // Retain the displayed row before the raster-178 handler shifts it below
    // the beam. Palette rotations similarly become visible on the next frame.
    this.captureRasters();
    this.scrollText();
    this.rotatePalettes();
  }
}
