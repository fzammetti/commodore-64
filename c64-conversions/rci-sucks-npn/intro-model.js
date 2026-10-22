import { RASTER_LINES } from './timing.js';

// $1000-$11B3: vertical raster curtain over the recovered $0400 screen.
export class IntroModel {
  constructor(ram, io) {
    this.memory = new Uint8Array(ram);
    this.io = new Uint8Array(io);
    this.frame = 0;
    this.curtain = 160;
    this.closing = false;
    this.complete = false;
    this.io[0x11] = 0x1b;
    this.io[0x16] = 0xc8;
    this.io[0x18] = 0x12;
    this.io[0x15] = this.io[0x20] = this.io[0x21] = 0;
    this.io.fill(1, 0x800, 0xbe8);
    this.sourceYByRaster = new Int16Array(RASTER_LINES);
    this.renderCurtain();
  }
  advance() {
    if (!this.curtain) this.closing = true;
  }
  renderCurtain() {
    for (let line = 0; line < RASTER_LINES; line++) {
      this.sourceYByRaster[line] = Math.max(0, line - 51 - this.curtain);
    }
  }
  step() {
    this.frame++;
    if (this.closing) {
      this.curtain++;
      this.complete = this.curtain >= 180;
    } else if (this.curtain) this.curtain--;
    this.renderCurtain();
  }
}
