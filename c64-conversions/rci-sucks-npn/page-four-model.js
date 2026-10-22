import { CYCLES_PER_FRAME, CYCLES_PER_LINE, RASTER_LINES } from './timing.js';

export const PAGE_FOUR_MUSIC_DELAY = 361;

// Native translations of the raster curtain, FLD scroll, and color rotators.
// Busy-loop color pacing budgets NTSC CPU time; VIC/IRQ entry phases are approximate.
export class PageFourModel {
  constructor(ram, io = new Uint8Array(4096)) {
    this.memory = new Uint8Array(ram);
    this.io = new Uint8Array(io);
    this.frame = 0;
    this.musicDelay = PAGE_FOUR_MUSIC_DELAY;
    this.mainCycles = 0;
    this.mainDelay = 0;
    this.io[0xd00] = 3;
    this.io[0x11] = 0x1b;
    this.io[0x16] = 0xc8;
    this.io[0x18] = 0xac;
    this.io[0x15] = 0;
    this.io[0x20] = this.io[0x21] = 0;
    this.io.fill(0, 0x800, 0xbe8);
    this.memory[0xb0] = 0;
    this.memory[0xb1] = 0x2c;
    this.visibleColors = this.memory.slice(0x20ff, 0x2177);
    this.visibleFine = this.memory[0x220f];
    this.visibleDisplacement = 0;
    this.screenMemory = this.memory.slice(0x2800, 0x2be8);
    this.updateRaster();
  }

  // Negative until the reveal has finished; zero is the first music frame.
  get musicFrame() { return this.frame - this.musicDelay; }

  rotateLeft(address, length) {
    const m = this.memory, first = m[address];
    m.copyWithin(address, address + 1, address + length);
    m[address + length - 1] = first;
  }

  stepCurtain() {
    const m = this.memory;
    m[0x2027]++;
    if (m[0x2027] !== 3) return 0;
    m[0x2027] = 0;
    if (m[0x2028] === 1) {
      m[0x20e4] = m[0x20ff];
      this.rotateLeft(0x20ff, 120);
      return 1943;
    }
    m[0x20e4] = m[0x20ff];
    this.rotateLeft(0x20ff, 240);
    m[0x2029]++;
    if (m[0x2029] === 120) m[0x2028] = 1;
    return 3877;
  }

  scrollCharacter() {
    const m = this.memory;
    m.copyWithin(0x2af8, 0x2af9, 0x2b22);
    let pointer = m[0xb0] | (m[0xb1] << 8);
    let character = m[pointer];
    if (!character) { pointer = 0x2c00; character = m[pointer]; }
    if (character === 0x1f || character === 0x5f) {
      m[0x2349] = 1;
      m[0x234a] = 160;
    } else if (character === 0x1e || character === 0x5e) {
      m[0x234b] = m[0x234b] === 1 ? 0 : 1;
    } else m[0x2b1f] = character;
    pointer = (pointer + 1) & 65535;
    m[0xb0] = pointer & 255;
    m[0xb1] = pointer >> 8;
  }

  stepScroll() {
    const m = this.memory;
    if (m[0x2349] === 1) {
      m[0x234a]--;
      if (!m[0x234a]) m[0x2349] = 0;
    } else {
      m[0x220f] -= m[0x234b] ? 2 : 1;
      if (m[0x220f] === 0xbf) {
        m[0x220f] = 0xc7;
        this.scrollCharacter();
      }
    }
    m[0x20e4] = m[0x2293];
    m[0x22fa] = 0;
    this.rotateLeft(0x2293, 53);
  }

  stepMain() {
    const m = this.memory, io = this.io;
    if (m[0x2403] !== 2) { m[0x2403]++; return 23; }
    m[0x2403] = 0;
    io.fill(m[0x2444], 0xa30, 0xaa8);
    m[0x2443] = m[0x2444];
    this.rotateLeft(0x2444, 40);
    // X counts from 40 down to 1: the palette's byte 40 is deliberately used.
    for (let x = 40; x > 0; x--) io[0xaf7 + x] = m[0x2493 + x];
    const last = m[0x24ba];
    m[0x2443] = last;
    m.copyWithin(0x2494, 0x2493, 0x24ba);
    m[0x2493] = last;
    return 2851;
  }

  step() {
    const m = this.memory;
    const hadScroll = m[0x2028] === 1;
    this.visibleColors.set(m.subarray(0x20ff, 0x2177));
    this.visibleFine = m[0x220f];
    this.visibleDisplacement = hadScroll ? m[0x2293] : 0;
    // The IRQ shifts this row after displaying it. Keep its screen cells
    // paired with the fine-scroll value that the VIC used for this frame.
    this.screenMemory = m.slice(0x2800, 0x2be8);
    const rotationCycles = this.stepCurtain();
    if (hadScroll) this.stepScroll();
    // Recovered foreground loop: 4*(160 DEX/CPX/BNE) plus loop overhead.
    // Reserve the raster routine, normal badlines, and lower music/FLD IRQ.
    this.mainCycles += CYCLES_PER_FRAME - 6400 - rotationCycles - 1000
      - (hadScroll ? 2200 + this.visibleDisplacement * CYCLES_PER_LINE : 0);
    while (this.mainCycles >= this.mainDelay) {
      this.mainCycles -= this.mainDelay;
      this.mainDelay = 4527 + this.stepMain();
    }
    this.frame++;
    this.updateRaster();
  }

  updateRaster() {
    this.fontByRaster = new Uint16Array(RASTER_LINES).fill(0x3000);
    this.fontByRaster.fill(0x800, 48, 146);
    this.sourceYByRaster = new Int16Array(RASTER_LINES);
    this.d011ByRaster = new Uint8Array(RASTER_LINES).fill(0x1b);
    for (let line = 0; line < RASTER_LINES; line++) {
      this.sourceYByRaster[line] = line - 51;
      if (line >= 194 && this.memory[0x2028]) {
        this.sourceYByRaster[line] = line < 194 + this.visibleDisplacement
          ? -1 : line - 51 - Math.max(0, this.visibleDisplacement - 1);
      }
    }
    this.rasterWrites = [{ clock: 0, register: 0x21, value: 0 },
      { clock: 0, register: 0x16, value: 0xc8 }];
    let clock = 48 * CYCLES_PER_LINE + 45;
    for (let stripe = 0; stripe < 120; stripe++) {
      this.rasterWrites.push({ clock, register: 0x21, value: this.visibleColors[stripe] });
      clock += stripe === 0 ? 43 : 52;
    }
    this.rasterWrites.push({ clock: clock + 35, register: 0x21, value: 0 });
    const fontEnd = Math.ceil((clock + 55) / CYCLES_PER_LINE);
    this.fontByRaster.fill(0x800, 48, Math.min(fontEnd, RASTER_LINES));
    if (this.memory[0x2028]) {
      this.rasterWrites.push({ clock: 194 * CYCLES_PER_LINE + 55,
        register: 0x16, value: this.visibleFine });
      // Keep fine scrolling active through all eight glyph rows. The original
      // restores D016 after its screen/table updates, safely below this row.
      const scrollTop = 203 + Math.max(0, this.visibleDisplacement - 1);
      this.rasterWrites.push({ clock: (scrollTop + 8) * CYCLES_PER_LINE,
        register: 0x16, value: 0xc8 });
    }
  }
}
