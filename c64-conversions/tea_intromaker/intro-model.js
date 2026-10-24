import { RASTER_LINES } from './timing.js';

// Three raster IRQs ($249C at line $7A, $25EE at $92, $2749 at $AA) each paint an
// eight-line color bar behind one scroller row by writing $D020 and $D021 together.
const BARS = [
  { line: 123, fine: 0x2567, table: 0x2570 },
  { line: 147, fine: 0x26bc, table: 0x26c5 },
  { line: 171, fine: 0x2814, table: 0x281d }
];
// Scroller rows 9, 12 and 15; the middle one moves two pixels per frame.
const SCROLLERS = [
  { fine: 0x2567, steps: 1, pointer: 0x271f, row: 0x0568, text: 0x1800 },
  { fine: 0x26bc, steps: 2, pointer: 0x2721, row: 0x05e0, text: 0x1c00 },
  { fine: 0x2814, steps: 1, pointer: 0x2723, row: 0x0658, text: 0x2a00 }
];
const SCREEN = 0x0400, FONT = 0x0800;

export class IntroModel {
  constructor(ram, io) {
    this.memory = new Uint8Array(ram);
    this.io = new Uint8Array(io);
    this.frame = 0;
    this.border = this.background = 0;
    this.borderByRaster = new Uint8Array(RASTER_LINES);
    this.backgroundByRaster = this.borderByRaster;
    this.d016ByRaster = new Uint8Array(RASTER_LINES).fill(0xc8);
    this.font = this.memory.subarray(FONT, FONT + 2048);
    this.screen = new Uint8Array(1000);
    this.color = new Uint8Array(1000);
    this.latch();
  }

  // $2400: the setup a saved intro runs at SYS 9216, for intros taken from the editor.
  static fromProgram(ram, io, program) {
    const model = new IntroModel(ram, io);
    const m = model.memory;
    m.set(program.subarray(0x0800, 0x2e00), 0x0800);
    m[0x0286] = 0;
    m.fill(0x20, SCREEN, SCREEN + 1000);
    model.io.fill(0, 0x800, 0x800 + 1000);
    // Each page copy stops at $FF; the fix-ups store $22FF over itself, so $06FF stays blank.
    for (let page = 0; page < 4; page++) {
      m.copyWithin(SCREEN + page * 256, 0x2000 + page * 256, 0x2000 + page * 256 + 255);
    }
    m[0x04ff] = m[0x20ff];
    m[0x05ff] = m[0x21ff];
    for (const scroller of SCROLLERS) model.restart(scroller);
    model.latch();
    return model;
  }

  // The VIC shows rows 4-15 before the third IRQ changes RAM, so latch them first.
  latch() {
    const m = this.memory;
    this.screen.set(m.subarray(SCREEN, SCREEN + 1000));
    this.color.set(this.io.subarray(0x800, 0x800 + 1000));
    for (const bar of BARS) {
      for (let index = 0; index < 8; index++) {
        this.borderByRaster[bar.line + index] = m[bar.table - 8 + index];
        this.d016ByRaster[bar.line + index] = m[bar.fine];
      }
    }
  }

  // $257A/$26CF/$2827: every fifth frame the left half of the eight colors rotates
  // left and the right half rotates right; the result is copied to the IRQ's table.
  rotateBar(table) {
    const m = this.memory, counter = table + 8, temp = table + 9;
    if (m[counter] !== 4) {
      m[counter]++;
      return;
    }
    m[counter] = 0;
    m[temp] = m[table];
    m.copyWithin(table, table + 1, table + 5);
    m[table + 3] = m[temp];
    m[temp] = m[table + 7];
    m.copyWithin(table + 5, table + 4, table + 7);
    m[table + 4] = m[temp];
    m.copyWithin(table - 8, table, table + 8);
  }

  // $24E3/$2635/$2790: lower $D016 until it passes $C0, then shift the row and
  // append the next text byte plus $80, the reversed half of the font.
  scroll(scroller) {
    const m = this.memory;
    m[scroller.fine] = (m[scroller.fine] - scroller.steps) & 255;
    if (m[scroller.fine] !== 0xbf) return false;
    m[scroller.fine] = 0xc7;
    m.copyWithin(scroller.row, scroller.row + 1, scroller.row + 41);
    this.fetch(scroller);
    return true;
  }

  fetch(scroller) {
    const m = this.memory;
    let pointer = m[scroller.pointer] | (m[scroller.pointer + 1] << 8);
    if (m[pointer] === 0) {
      // $252D/$2682/$27DA. A text starting with @ would hang the original here.
      pointer = scroller.text;
      if (m[pointer] === 0) return;
    }
    m[scroller.row + 39] = (m[pointer] + 0x80) & 255;
    pointer = (pointer + 1) & 0xffff;
    m[scroller.pointer] = pointer & 255;
    m[scroller.pointer + 1] = pointer >> 8;
  }

  restart(scroller) {
    this.memory[scroller.pointer] = scroller.text & 255;
    this.memory[scroller.pointer + 1] = scroller.text >> 8;
    this.fetch(scroller);
  }

  // $28B5: every fourth frame, rows 4 and 20 take the next of sixteen colors.
  cycleColors() {
    const m = this.memory;
    if (m[0x28b1] !== 3) {
      m[0x28b1]++;
      return false;
    }
    m[0x28b1] = 0;
    this.io.fill(m[0x28ef], 0x800 + 160, 0x800 + 200);
    this.io.fill(m[0x28ef], 0x800 + 800, 0x800 + 840);
    m[0x2579] = m[0x28ef];
    m.copyWithin(0x28ef, 0x28f0, 0x2900);
    m[0x28fe] = m[0x2579];
    return true;
  }

  step() {
    this.latch();
    for (const bar of BARS) this.rotateBar(bar.table);
    const shifted = SCROLLERS.map(scroller => this.scroll(scroller));
    const recolored = this.cycleColors();
    // Row 20's color is fetched at line 211. On frames without the slower outer
    // scroller shifts, $28B5 finishes first, so row 20 changes a frame before row 4.
    if (recolored && !shifted[0] && !shifted[2]) {
      this.color.set(this.io.subarray(0x800 + 800, 0x800 + 840), 800);
    }
    this.frame++;
  }
}
