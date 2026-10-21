import { CYCLES_PER_LINE, RASTER_LINES } from './timing.js';

/** Native translations of the recovered $3200 page's graphics routines. */
export class PageOneModel {
  constructor(memory, io) {
    this.memory = new Uint8Array(memory).slice();
    this.io = new Uint8Array(io).slice();
    if (this.memory.length !== 65536 || this.io.length !== 4096) {
      throw new Error('PageOneModel requires 64 KiB RAM and 4 KiB I/O.');
    }
    this.frame = 0;
    this.d016ByRaster = new Uint8Array(RASTER_LINES);
    this.d022ByRaster = new Uint8Array(RASTER_LINES);
    this.d023ByRaster = new Uint8Array(RASTER_LINES);
    this.multicolor1ByRaster = this.d022ByRaster;
    this.multicolor2ByRaster = this.d023ByRaster;
    this.refreshColors();
    this.captureRasters();
  }

  // $3321. The forward loops read 96 entries, including the following opcode,
  // before restoring the final slot. Keep the original loop bounds and scratch byte.
  rotatePalettes() {
    const m = this.memory;
    for (const [base, direction] of [[0x32c1, 0x32b4], [0x33d5, 0x32b6]]) {
      if (m[direction] === 1) {
        m[0x32ba] = m[base];
        for (let index = 0; index < 96; index++) m[base + index] = m[base + index + 1];
        m[base + 95] = m[0x32ba];
      } else {
        m[0x32ba] = m[base + 95];
        for (let index = 94; index >= 0; index--) m[base + index + 1] = m[base + index];
        m[base] = m[0x32ba];
      }
    }
    m[0x32b8]++;
    if (m[0x32b8] === 90) {
      m[0x32b4] = m[0x32b4] === 1 ? 0 : 1;
      m[0x32b6] = m[0x32b6] === 1 ? 0 : 1;
      m[0x32b8] = 0;
    }
  }

  // $355f. CPX clears carry between rows; carry crosses all eight sprite blocks.
  shiftSprites() {
    const m = this.memory;
    for (let row = 0; row < 8; row++) {
      let carry = 0;
      for (let sprite = 7; sprite >= 0; sprite--) {
        for (let column = 2; column >= 0; column--) {
          const address = 0x3000 + sprite * 64 + row * 3 + column;
          const value = m[address];
          m[address] = (value << 1) | carry;
          carry = value >> 7;
        }
      }
    }
  }

  // $3639 preserves the caller's shared zero-page pointer by swapping it with $3658/9.
  swapPointers() {
    const m = this.memory;
    [m[0xb0], m[0x3658]] = [m[0x3658], m[0xb0]];
    [m[0xb1], m[0x3659]] = [m[0x3659], m[0xb1]];
  }

  // $35b2/$3601. Preserve partial triplets when the original zero terminator is reached.
  fetchCharacters() {
    const m = this.memory;
    this.swapPointers();
    m[0xb0] = m[0x3652];
    m[0xb1] = m[0x3653];
    for (let index = 0; index < 3; index++) {
      const pointer = m[0xb0] | (m[0xb1] << 8);
      const character = m[pointer];
      if (character === 0) {
        m[0x3652] = 0;
        m[0x3653] = 0x2c;
        break;
      }
      m[0x3654 + index] = character;
      const next = (pointer + 1) & 65535;
      m[0xb0] = next & 255;
      m[0xb1] = next >> 8;
      if (index === 2) {
        m[0x3652] = m[0xb0];
        m[0x3653] = m[0xb1];
      }
    }
    let index = 0;
    do {
      const glyph = 0x2000 + m[0x3654 + index] * 8;
      m[0xb0] = glyph & 255;
      m[0xb1] = glyph >> 8;
      for (let row = 0; row < 8; row++) m[0x31c0 + m[0x3657] + row * 3] = m[glyph + row];
      index++;
      m[0x3657]++;
    } while (m[0x3657] !== 3);
    m[0x3657] = 0;
    this.swapPointers();
  }

  scroll() {
    this.shiftSprites();
    this.memory[0x355e]++;
    if (this.memory[0x355e] === 24) {
      this.memory[0x355e] = 0;
      this.fetchCharacters();
    }
  }

  // $365c: update on every fourth call, then traverse the original $369b bounce table.
  bounce() {
    const m = this.memory;
    if (m[0x365a] !== 3) {
      m[0x365a]++;
      return;
    }
    m[0x365a] = 0;
    const y = m[0x369b + m[0x365b]];
    for (let sprite = 0; sprite < 7; sprite++) this.io[sprite * 2 + 1] = y;
    m[0x365b]++;
    if (m[0x369b + m[0x365b]] === 255) m[0x365b] = 0;
  }

  // $3738: opposite rotations of the two 40-entry text-color palettes.
  rotateColors() {
    const m = this.memory;
    m[0x32ba] = m[0x376b];
    for (let index = 0; index < 40; index++) m[0x376b + index] = m[0x376c + index];
    m[0x3792] = m[0x32ba];
    m[0x32ba] = m[0x37ba];
    for (let index = 38; index >= 0; index--) m[0x3794 + index] = m[0x3793 + index];
    m[0x3793] = m[0x32ba];
  }

  // $3704/$371d are the idle main loop, continuously copying the latest palette state.
  refreshColors() {
    const m = this.memory;
    for (let index = 0; index < 40; index++) {
      this.io[0x828 + index] = m[0x376b + index];
      this.io[0x8c8 + index] = m[0x376b + index];
      this.io[0x878 + index] = m[0x3793 + index];
    }
    for (let sprite = 0; sprite < 7; sprite++) this.io[0x27 + sprite] = m[0x33d5];
  }

  captureRasters() {
    const m = this.memory;
    const writes = [];
    // 7 hardware IRQ cycles + the KERNAL's register-save/vector dispatch (~29).
    let clock = 112 * CYCLES_PER_LINE + 36;
    const advance = count => {
      // Scanline approximation of the 40 CPU cycles stolen on character badlines.
      // Sprite DMA and instruction-boundary IRQ jitter are left to reference calibration.
      for (let cycle = 0; cycle < count; cycle++) {
        let line = Math.floor(clock / CYCLES_PER_LINE);
        let at = clock % CYCLES_PER_LINE;
        if (line >= 51 && line <= 250 && (line & 7) === 3 && at >= 15 && at < 55) {
          clock += 55 - at;
          line = Math.floor(clock / CYCLES_PER_LINE);
          at = clock % CYCLES_PER_LINE;
        }
        clock++;
      }
    };
    const write = (register, value) => writes.push({ clock, register, value });
    advance(26); write(0x23, m[0x32c1]);
    advance(8); write(0x22, m[0x33d5]);
    advance(6); write(0x16, 0xd8);
    advance(22); // LDX #0, delay subroutine, LDY #1.
    for (let index = 1; index < 80; index++) {
      advance(8 + (index >= 63 ? 1 : 0)); write(0x23, m[0x32c1 + index]);
      advance(8 + (index >= 43 ? 1 : 0)); write(0x22, m[0x33d5 + index]);
      advance(6); write(0x16, 0xd8);
      advance(41 - (index === 79 ? 1 : 0));
    }
    advance(26); write(0x23, 0);
    advance(4); write(0x22, 0);
    advance(6); write(0x16, 0xc8);
    this.rasterWrites = writes;
    const values = { 0x16: 0xc8, 0x22: 0, 0x23: 0 };
    let next = 0;
    for (let line = 0; line < RASTER_LINES; line++) {
      // Sample at the left edge of the active display; intra-line writes remain in rasterWrites.
      const position = line * CYCLES_PER_LINE + 18;
      while (next < writes.length && writes[next].clock <= position) {
        const event = writes[next++];
        values[event.register] = event.value;
      }
      this.d016ByRaster[line] = values[0x16];
      this.d022ByRaster[line] = values[0x22] & 15;
      this.d023ByRaster[line] = values[0x23] & 15;
    }
  }

  step() {
    this.bounce();
    this.scroll();
    this.rotateColors();
    this.refreshColors();
    this.captureRasters();
    this.memory[0x3246]++;
    if (this.memory[0x3246] === 2) {
      this.memory[0x3246] = 0;
      this.rotatePalettes();
    }
    // Palette rotation occurs after the multicolor band and before the bottom sprites.
    for (let sprite = 0; sprite < 7; sprite++) this.io[0x27 + sprite] = this.memory[0x33d5];
    this.frame++;
  }
}
