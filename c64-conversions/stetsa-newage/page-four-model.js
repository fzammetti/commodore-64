import { CYCLES_PER_LINE, RASTER_LINES } from './timing.js';

// Approximate the VIC's badline stalls while retaining the original polling-loop timing.
class RasterClock {
  constructor(line) { this.clock = line * CYCLES_PER_LINE + 36; }
  advance(cycles) {
    for (let index = 0; index < cycles; index++) {
      const line = Math.floor(this.clock / CYCLES_PER_LINE);
      const cycle = this.clock % CYCLES_PER_LINE;
      if (line >= 51 && line <= 250 && (line & 7) === 3 && cycle >= 15 && cycle < 55) {
        this.clock += 55 - cycle;
      }
      this.clock++;
    }
  }
  waitLine() {
    this.advance(4); // LDA $D012.
    const before = Math.floor(this.clock / CYCLES_PER_LINE) & 255;
    for (let count = 0; count < 100; count++) {
      this.advance(4); // CMP $D012.
      const equal = (Math.floor(this.clock / CYCLES_PER_LINE) & 255) === before;
      this.advance(equal ? 3 : 2);
      if (!equal) return before;
    }
    throw new Error('Raster wait did not reach the next line.');
  }
}

/** Native translation of the two reverse-character scrollers and variable-height color bars. */
export class PageFourModel {
  constructor(memory, io) {
    this.memory = new Uint8Array(memory).slice();
    this.io = new Uint8Array(io).slice();
    if (this.memory.length !== 65536 || this.io.length !== 4096) {
      throw new Error('PageFourModel requires 64 KiB RAM and 4 KiB I/O.');
    }
    this.frame = 0;
    // Both IRQs display their row before shifting screen RAM for the next frame.
    this.screenMemory = this.memory.slice(0x2000, 0x2400);
    this.d016ByRaster = new Uint8Array(RASTER_LINES);
    this.backgroundByRaster = new Uint8Array(RASTER_LINES);
    this.borderByRaster = new Uint8Array(RASTER_LINES);
    this.captureRasters();
  }

  // $30bb. Its forward loop reads the following instruction before restoring the last slot.
  rotateHeights() {
    const m = this.memory;
    if (m[0x30e8] !== 3) { m[0x30e8]++; return; }
    m[0x30e8] = 0;
    m[0x30f2] = m[0x30ab];
    m[0x30e9] = 0;
    for (let index = 0; index < 16; index++) m[0x30ab + index] = m[0x30ac + index];
    m[0x30ba] = m[0x30f2];
  }

  // $3170 / $327f. $31b0 / $32c2 fetch the first character immediately at a terminator.
  scroll(which) {
    const m = this.memory;
    const second = which === 1;
    const fine = second ? 0x32cd : 0x31bb;
    const row = second ? 0x2370 : 0x22a8;
    const pointer = second ? 0x331b : 0x3319;
    m[0xb0] = m[pointer];
    m[0xb1] = m[pointer + 1];
    m[fine] -= second ? 2 : 1;
    if (m[fine] !== 0xbf) return;
    m[fine] = 0xc7;
    for (let index = 0; index < 40; index++) m[row + index] = m[row + index + 1];
    let address = m[0xb0] | (m[0xb1] << 8);
    if (m[address] === 0) address = second ? 0x2800 : 0x2400;
    // Both text streams are zero-terminated and contain no empty loop in the recovered program.
    if (m[address] === 0) throw new Error('The recovered scroller text is empty.');
    m[row + 39] = m[address] + 0x80;
    address = (address + 1) & 65535;
    m[0xb0] = m[pointer] = address & 255;
    m[0xb1] = m[pointer + 1] = address >> 8;
  }

  // $31dd / $32ef. Rotate their 32-entry color tables in opposite directions every fourth call.
  rotateScrollColors(which) {
    const m = this.memory;
    const base = which === 1 ? 0x32ce : 0x31bc;
    const counter = which === 1 ? 0x32ee : 0x31dc;
    if (m[counter] !== 3) { m[counter]++; return; }
    m[counter] = 0;
    if (which === 1) {
      m[0x30f2] = m[base + 31];
      for (let index = 30; index >= 0; index--) m[base + index + 1] = m[base + index];
      m[base] = m[0x30f2];
    } else {
      m[0x30f2] = m[base];
      for (let index = 0; index < 32; index++) m[base + index] = m[base + index + 1];
      m[base + 31] = m[0x30f2];
    }
  }

  captureRasters() {
    const m = this.memory;
    const writes = [];
    let timer;
    const write = (register, value) => writes.push({ clock: timer.clock, register, value });
    timer = new RasterClock(50);
    timer.advance(19);
    for (let band = 0; band < 8; band++) {
      timer.advance(8); write(0x20, m[0x30ea + band]);
      timer.advance(4); write(0x21, m[0x30ea + band]);
      const height = m[0x30ab + band];
      timer.advance(4 + (height === 0 ? 3 : 2));
      for (let line = 0; line < height; line++) {
        const previous = timer.waitLine();
        timer.advance(8);
        // The source says STA $D01F, not D011: this collision-register write does not scroll the display.
        write(0x1f, (previous & 7) | 0x10);
        timer.advance(2 + (line === height - 1 ? 2 : 3));
      }
      timer.advance(2); // LDY #8.
      for (let line = 0; line < 8; line++) {
        timer.waitLine();
        timer.advance(2 + (line === 7 ? 2 : 3));
      }
      timer.advance(2 + 2 + 42 + (band === 7 ? 2 : 3));
    }
    timer.advance(6 + 2 + 29 + 6 + 6); // NOPs, six DEXs, more NOPs, LDA/STA D011.
    write(0x11, 0x1b);
    timer.advance(6); write(0x20, 0);

    for (const [line, fine, palette] of [[186, 0x31bb, 0x31bc], [226, 0x32cd, 0x32ce]]) {
      timer = new RasterClock(line);
      timer.advance(19); write(0x16, m[fine]);
      timer.advance(8); write(0x20, m[palette]);
      timer.advance(4); write(0x21, m[palette]);
      timer.advance(20);
      for (let index = 1; index < 8; index++) {
        timer.advance(8); write(0x20, m[palette + index]);
        timer.advance(4); write(0x21, m[palette + index]);
        timer.advance(45 + 4 + (index === 7 ? 2 : 3));
      }
      timer.advance(6); write(0x20, 0);
      timer.advance(4); write(0x21, 0);
      timer.advance(6); write(0x16, 0xc8);
    }
    // The final IRQ sets multicolor mode again after updating the music/scroller state.
    // Its exact cycle depends on the music player; rows below the last scroller are blank.
    timer = new RasterClock(240);
    write(0x16, 0xd8);
    writes.sort((a, b) => a.clock - b.clock);
    this.rasterWrites = writes;
    const values = { 0x16: 0xd8, 0x20: 0, 0x21: 0 };
    let next = 0;
    for (let line = 0; line < RASTER_LINES; line++) {
      const position = line * CYCLES_PER_LINE + 17;
      while (next < writes.length && writes[next].clock <= position) {
        const event = writes[next++];
        values[event.register] = event.value;
      }
      this.d016ByRaster[line] = values[0x16];
      this.backgroundByRaster[line] = values[0x21] & 15;
      this.borderByRaster[line] = values[0x20] & 15;
    }
  }

  step() {
    this.screenMemory.set(this.memory.subarray(0x2000, 0x2400));
    this.captureRasters();
    this.rotateHeights();
    this.scroll(0);
    this.rotateScrollColors(0);
    this.scroll(1);
    this.rotateScrollColors(1);
    this.io[0x16] = 0xd8;
    this.frame++;
  }
}
