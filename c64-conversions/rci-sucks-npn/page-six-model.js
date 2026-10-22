import { CYCLES_PER_FRAME } from './timing.js';

// $1000-$1120: final letter, with counter-moving 40-column color tables.
// This section retains the KERNAL's NTSC CIA timer instead of a raster IRQ.
const NTSC_CIA_PERIOD = 0x4295 + 1;
export class PageSixModel {
  constructor(ram, io) {
    this.memory = new Uint8Array(ram);
    this.io = new Uint8Array(io);
    this.frame = 0;
    this.irqCount = 0;
    this.timer = 0;
    this.io[0x11] = 0x1b;
    this.io[0x16] = 0xc8;
    this.io[0x18] = 0x82;
    this.io[0x15] = this.io[0x20] = this.io[0x21] = 0;
    this.io.fill(0, 0x800, 0xc00);
  }
  interrupt() {
    const m = this.memory;
    for (let column = 0; column < 40; column++) {
      for (let row = 0; row < 25; row++) {
        // Preserve the original DA07 typo in the odd-row fill at $1084.
        const target = row === 13 ? 0xa07 + column : 0x800 + row * 40 + column;
        this.io[target] = m[(row & 1 ? 0x10f9 : 0x10d1) + column];
      }
    }
    const left = m[0x10d1], right = m[0x1120];
    m.copyWithin(0x10d1, 0x10d2, 0x10fa);
    m[0x10f8] = left;
    m.copyWithin(0x10fa, 0x10f9, 0x1120);
    m[0x10f9] = right;
    this.irqCount++;
  }
  step() {
    this.timer += CYCLES_PER_FRAME;
    while (this.timer >= NTSC_CIA_PERIOD) {
      this.interrupt();
      this.timer -= NTSC_CIA_PERIOD;
    }
    this.frame++;
  }
}
