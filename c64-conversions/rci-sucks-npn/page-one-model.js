import { CYCLES_PER_FRAME, RASTER_LINES } from './timing.js';

const LONG_DELAY = 459524 + 6;
const SHORT_DELAY = 30519 + 6;
const COLOR_FILL = 5287 + 6;
const SCREEN_COPY = 16356 + 6;

// The busy-loop delays run concurrently with music and sprite IRQs. These are
// instruction counts measured using the recovered player, rather than PAL waits.
// Music varies by note: 1,631 is its mean over 6,000 calls (968..2,211 cycles).
// VIC arbitration and the KERNAL screen clear are approximations; fades can
// differ by a frame from a cycle-exact C64, while sprite phases are exact.
const MAIN_CYCLES_PER_FRAME = CYCLES_PER_FRAME - 1000 - 336 - 1631 - 1484 - 136;
const CLEAR_CYCLES = 12000;

/** Native translation of the $1600 introduction and its $182d sprite IRQ. */
export class PageOneModel {
  constructor(memory, io) {
    this.memory = new Uint8Array(memory).slice();
    this.io = new Uint8Array(io).slice();
    if (this.memory.length !== 65536 || this.io.length !== 4096) {
      throw new Error('PageOneModel requires 64 KiB RAM and 4 KiB I/O.');
    }
    this.frame = 0;
    this.screenNumber = 0;
    this.stage = 'initial';
    this.remainingCycles = LONG_DELAY * 9 + SHORT_DELAY * 2 + 16;
    this.backgroundByRaster = new Uint8Array(RASTER_LINES);
    this.borderByRaster = new Uint8Array(RASTER_LINES);
    this.characterBaseByRaster = new Uint16Array(RASTER_LINES).fill(0x3800);
    this.screenBaseByRaster = new Uint16Array(RASTER_LINES).fill(0x0400);

    // $1603..$166d: select the recovered custom font and cyan dot sprites.
    this.io[0x11] = 0x1b;
    this.io[0x16] = 0x08;
    this.io[0x18] = 0x1e;
    this.io[0x20] = 0;
    this.io[0x21] = 0;
    this.io[0x15] = 255;
    this.io[0x17] = 0;
    this.io[0x1b] = 0;
    this.io[0x1c] = 0;
    this.io[0x1d] = 0;
    this.io[0xd00] = (this.io[0xd00] & 0xfc) | 3;
    this.io.fill(3, 0x27, 0x2f);
    this.memory.set([193, 119, 239, 68, 193, 119, 239, 68], 0x1899);
    this.memory[0x1c5d] = 1;
    this.memory[0x1c5e] = 0;
    this.clearScreen();
  }

  clearScreen() {
    this.memory.fill(0x20, 0x0400, 0x07e8);
    this.io.fill(0, 0x800, 0xbe8);
    this.restoreSpritePointers();
  }

  restoreSpritePointers() {
    this.memory.fill(0x0d, 0x07f8, 0x0800);
  }

  // $182d: retain table lookup quantization and the original phase increments.
  moveSprites() {
    const m = this.memory;
    let highX = 0;
    for (let sprite = 0; sprite < 8; sprite++) {
      const x = m[0x1900 + m[0x189d]] + m[0x1900 + m[0x189e]] + m[0x1897];
      const y = (m[0x1900 + m[0x189f]] >> 1) + m[0x1900 + m[0x18a0]] + m[0x1898];
      this.io[sprite * 2] = x & 255;
      this.io[sprite * 2 + 1] = y & 255;
      if (x > 255) highX |= 1 << sprite;
      for (let phase = 0; phase < 4; phase++) m[0x189d + phase] += m[0x1893 + phase];
    }
    this.io[0x10] = highX;
    for (let phase = 0; phase < 4; phase++) {
      m[0x1899 + phase] += m[0x188f + phase];
      m[0x189d + phase] = m[0x1899 + phase];
    }
  }

  // $1ca7 writes 25 rows, including the original typo $da81 instead of $da80.
  fillColor(color) {
    for (let row = 0; row < 25; row++) {
      const start = 0x800 + row * 40 + Number(row === 16);
      this.io.fill(color & 15, start, start + 40);
    }
  }

  loadNextScreen() {
    const m = this.memory;
    const screen = m[0x1c5d];
    this.screenNumber = screen;
    m.copyWithin(0x0400, 0x2000 + (screen - 1) * 1024, 0x2000 + screen * 1024 - 1);
    // $1c55 dispatches zero after six; its no-op leaves screen six in place.
    m[0x1c5d] = screen === 6 ? 1 : screen + 1;
    this.restoreSpritePointers();
  }

  advanceStage() {
    const m = this.memory;
    if (this.stage === 'initial' || this.stage === 'clear') {
      this.clearScreen();
      this.stage = 'blank';
      this.remainingCycles += LONG_DELAY * 4 + CLEAR_CYCLES;
    } else if (this.stage === 'blank') {
      this.loadNextScreen();
      this.stage = 'fadeIn';
      this.remainingCycles += SCREEN_COPY;
    } else if (this.stage === 'hold') {
      this.stage = 'fadeOut';
    } else if (this.stage === 'fadeIn' || this.stage === 'fadeOut') {
      this.fillColor(m[0x1c5f + m[0x1c5e]]);
      m[0x1c5e]++;
      this.remainingCycles += COLOR_FILL + SHORT_DELAY + 31;
      if (m[0x1c5e] === 9) {
        this.stage = 'hold';
        this.remainingCycles += LONG_DELAY * 8;
      } else if (m[0x1c5e] === 19) {
        m[0x1c5e] = 0;
        this.stage = 'clear';
      }
    }
  }

  step() {
    this.frame++;
    this.moveSprites();
    this.remainingCycles -= MAIN_CYCLES_PER_FRAME;
    while (this.remainingCycles <= 0) this.advanceStage();
    // The full-screen copy temporarily overwrites these; $1f40 fixes every IRQ.
    this.restoreSpritePointers();
  }
}
