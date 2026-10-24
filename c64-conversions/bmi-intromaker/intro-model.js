import { RasterClock } from './raster-clock.js';

// Raster lines of the four chained IRQs and the cycle where each handler begins
// (IRQ sequence plus the KERNAL $FF48 entry, after the 3-cycle JMP main loop).
const LOGO_LINE = 0x38, BARS_LINE = 0x8a, SCROLL_LINE = 0xb0, SPRITE_LINE = 0xfa;
const HANDLER_CYCLE = 36;

/**
 * Native translation of the BMI intro template ($0A00-$1EA6) by Fantasy of NPN.
 * The model runs on the C64 memory image, so text typed into the editor's scroll
 * buffers ($3000, $3400) and screen data ($0C00) appears exactly as the C64 shows it.
 */
export class IntroModel {
  constructor(ram, io) {
    this.memory = new Uint8Array(ram).slice();
    this.io = new Uint8Array(io).slice();
    if (this.memory.length !== 65536 || this.io.length !== 4096) {
      throw new Error('IntroModel requires 64 KiB RAM and 4 KiB I/O.');
    }
    this.frame = 0;
    this.rasterWrites = [];
    this.space = false;
    this.launch = false;
    this.hung = false;
    this.clock = new RasterClock(this.rasterWrites, () => this.io[0x11]);
    this.initialize();
  }

  // VIC reads return 1 in the unused bits of $D016 and $D018.
  readVic(register) {
    return this.io[register] | (register === 0x16 ? 0xc0 : register === 0x18 ? 0x01 : 0);
  }

  vic(cycles, register, value) {
    this.clock.spend(cycles, register, value);
    this.io[register] = value;
  }

  // $0A22-$0AF4 and $1800-$182C, after the KERNAL initialization and screen clear.
  initialize() {
    const m = this.memory;
    for (let page = 0; page < 4; page++) {
      for (let x = 0; x < 255; x++) m[0x0400 + page * 256 + x] = m[0x0c00 + page * 256 + x];
    }
    // Logo character codes for screen rows 1-4: the three letters of the logo.
    const logo = [[0x431, 1, 7], [0x439, 0x21, 0x27], [0x441, 0x41, 0x47], [0x449, 0x61, 0x67],
      [0x432, 7, 13], [0x43a, 0x27, 0x2d], [0x442, 0x47, 0x4d], [0x44a, 0x67, 0x6d],
      [0x433, 13, 19], [0x43b, 0x2d, 0x33], [0x443, 0x4d, 0x53], [0x44b, 0x6d, 0x73]];
    for (const [base, from, to] of logo) {
      for (let x = from; x !== to; x++) m[base + x] = x;
    }
    m[0x05ff] = m[0x0dff];
    for (let x = 0; x < 40; x++) {
      this.io[0x9b8 + x] = 0;
      this.io[0x9e0 + x] = 0;
      this.io[0xa08 + x] = 0;
    }
    this.resetSpriteText();
    this.setupSprites();
    this.io[0x11] = 0x1b;
    this.io[0x1a] = 1;
    this.io[0x12] = LOGO_LINE;
    this.resetScrollText();
  }

  // $1C8B: the sprite scroll restarts at $3400.
  resetSpriteText() {
    const m = this.memory;
    m[0x1cbb] = 0;
    m[0x1cbc] = 0x34;
    this.storePointer();
  }

  // $1C95
  storePointer() {
    const m = this.memory;
    m[0x1cc3] = m[0xb0];
    m[0x1cc4] = m[0xb1];
  }

  // $1B4C and $1E7E: seven expanded sprites; sprite 7 is the hidden input column.
  setupSprites() {
    const m = this.memory, io = this.io;
    for (let sprite = 0; sprite < 8; sprite++) {
      io[sprite * 2] = (0x18 + sprite * 0x30) & 255;
      io[sprite * 2 + 1] = 0xe4;
      m[0x07f8 + sprite] = 0x20 + sprite;
      io[0x27 + sprite] = 1;
    }
    io[0x17] = 0xff;
    io[0x10] = 0x40;
    m.fill(0, 0x0800, 0x0a00);
    io[0x15] = 0x7f;
    io[0x1d] = 0x77;
    [0x1c, 0x4c, 0x7c, 0xac, 0xc4, 0xf4, 0x24].forEach((x, sprite) => { io[sprite * 2] = x; });
  }

  // $1AD5/$1AB5: start the character scroll at $3000 and fetch its first character.
  resetScrollText() {
    const m = this.memory;
    m[0xb0] = 0;
    m[0xb1] = 0x30;
    m[0x1b1c] = 0;
    m[0x1b1d] = 0x30;
    this.fetchScrollCharacter();
  }

  fetchScrollCharacter() {
    const m = this.memory;
    const character = m[m[0xb0] | (m[0xb1] << 8)];
    if (character === 0) {
      // An empty text loops forever inside the IRQ on the C64.
      if (m[0xb0] === 0 && m[0xb1] === 0x30) {
        this.hung = true;
        return;
      }
      this.resetScrollText();
      return;
    }
    m[0x06a7] = character;
    m[0xb0] = (m[0xb0] + 1) & 255;
    if (m[0xb0] === 0) m[0xb1] = (m[0xb1] + 1) & 255;
    m[0x1b1c] = m[0xb0];
    m[0x1b1d] = m[0xb1];
  }

  step(renderTo = () => {}) {
    this.rasterWrites.length = 0;
    if (this.hung) return;
    this.frame++;
    const jitter = this.frame % 3;
    // Each handler's memory changes only reach lines the C64 has not displayed yet.
    this.logoInterrupt(jitter);
    renderTo(BARS_LINE);
    this.barsInterrupt(jitter, renderTo);
    renderTo(SCROLL_LINE);
    this.scrollInterrupt(jitter, renderTo);
    renderTo(SPRITE_LINE);
    this.spriteInterrupt();
  }

  // $1830: per-line multicolor pairs over the logo, from the $18BA/$18DA tables.
  logoInterrupt(jitter) {
    const m = this.memory, c = this.clock.at(LOGO_LINE, HANDLER_CYCLE + jitter);
    c.spend(2); c.spend(4); c.spend(2); c.spend(4);
    c.spend(4); c.spend(2); c.spend(2); c.spend(2);
    this.vic(4, 0x22, m[0x18ba]);
    c.spend(4);
    this.vic(4, 0x23, m[0x18da]);
    c.spend(4); c.spend(2); c.spend(2);
    this.vic(4, 0x18, (this.readVic(0x18) & 0xf0) | 0x0a);
    c.spend(4); c.spend(2);
    this.vic(4, 0x16, this.readVic(0x16) | 0x10);
    c.spend(2);
    c.delay(7);
    c.spend(2);
    for (let y = 1; y < 0x20; y++) {
      c.spend(4);
      this.vic(4, 0x22, m[0x18ba + y]);
      c.spend(4);
      this.vic(4, 0x23, m[0x18da + y]);
      // The original stores this $D018 value to $D014 (light pen), so the font is unchanged.
      c.spend(4); c.spend(2); c.spend(2); c.spend(4);
      c.spend(4); c.spend(2);
      this.vic(4, 0x16, this.readVic(0x16) | 0x10);
      c.spend(2);
      c.delay(0);
      c.spend(2); c.spend(2); c.spend(y < 0x1f ? 3 : 2);
    }
    c.spend(2);
    c.delay(0);
    c.spend(2);
    this.vic(4, 0x22, 0);
    this.vic(4, 0x23, 0);
    c.spend(4); c.spend(2); c.spend(2);
    this.vic(4, 0x18, (this.readVic(0x18) & 0xf0) | 0x08);
    c.spend(4); c.spend(2);
    this.vic(4, 0x16, this.readVic(0x16) & 0xef);
    this.bounceSprites();
    this.rotateLogoColors();
    this.rotateBarColors();
  }

  // $1D00: every third frame the sprite scroll moves one line between $C3 and $D9.
  bounceSprites() {
    const m = this.memory;
    if (m[0x1cff] !== 2) {
      m[0x1cff]++;
      return;
    }
    m[0x1cff] = 0;
    if (m[0x1cfd] === 1) {
      m[0x1cfe]++;
      if (m[0x1cfe] === 0xd9) m[0x1cfd] = 0;
    } else {
      m[0x1cfe]--;
      if (m[0x1cfe] === 0xc3) m[0x1cfd] = 1;
    }
    for (let sprite = 0; sprite < 7; sprite++) this.io[sprite * 2 + 1] = m[0x1cfe];
  }

  // $18FA: every fourth frame one logo table rotates up and the other down.
  rotateLogoColors() {
    const m = this.memory;
    if (m[0x182f] !== 3) {
      m[0x182f]++;
      return;
    }
    m[0x182f] = 0;
    let saved = m[0x18ba];
    for (let y = 0; y < 0x20; y++) m[0x18ba + y] = m[0x18bb + y];
    m[0x18d9] = saved;
    saved = m[0x193d] = m[0x18f9];
    for (let y = 0x1e; y >= 0; y--) m[0x18db + y] = m[0x18da + y];
    m[0x18da] = saved;
  }

  // $19CA: every third frame the bar colors and the horizontal sway step on.
  rotateBarColors() {
    const m = this.memory;
    if (m[0x1962] !== 2) {
      m[0x1962]++;
      return;
    }
    m[0x1962] = 0;
    let saved = m[0x19b2];
    for (let y = 0; y < 0x18; y++) m[0x19b2 + y] = m[0x19b3 + y];
    m[0x19c9] = saved;
    saved = m[0x193d] = m[0x1a2c];
    for (let y = 0x1e; y >= 0; y--) m[0x1a0e + y] = m[0x1a0d + y];
    m[0x1a0d] = saved;
  }

  // $1963: background bars behind the reversed screen-data lines. The loop takes
  // 60 cycles, so each color change starts five cycles earlier on the next line.
  barsInterrupt(jitter, renderTo) {
    const m = this.memory, c = this.clock.at(BARS_LINE, HANDLER_CYCLE + jitter);
    c.spend(2); c.spend(4); c.spend(2); c.spend(4);
    c.spend(4); c.spend(2); c.spend(2); c.spend(2);
    this.vic(4, 0x21, m[0x19b2]);
    c.spend(4);
    this.vic(4, 0x16, m[0x1a0d]);
    c.spend(2);
    c.delay(0);
    c.spend(2);
    for (let y = 1; y < 0x18; y++) {
      c.spend(4);
      this.vic(4, 0x21, m[0x19b2 + y]);
      c.spend(4);
      this.vic(4, 0x16, m[0x1a0d]);
      c.spend(2); c.spend(2);
      c.delay(3);
      c.spend(2); c.spend(2); c.spend(y < 0x17 ? 3 : 2);
    }
    c.spend(2);
    c.delay(0);
    c.spend(2);
    this.vic(4, 0x20, 0);
    this.vic(4, 0x21, 0);
    c.spend(2);
    this.vic(4, 0x16, 0xc8);
    renderTo(this.clock.line + 1);
    // $1D8F: the shimmer colors of screen row 7.
    for (let x = 0; x < 40; x++) this.io[0x918 + x] = m[0x1e04 + x];
  }

  // $1A51: fine scroll for the character scroller on screen row 16.
  scrollInterrupt(jitter, renderTo) {
    const m = this.memory, c = this.clock.at(SCROLL_LINE, HANDLER_CYCLE + jitter);
    c.spend(3); c.spend(4); c.spend(2); c.spend(2); c.spend(4);
    this.vic(4, 0x16, m[0x1b1b]);
    c.spend(2);
    c.delay(1);
    for (let y = 1; y < 8; y++) {
      c.spend(2);
      c.delay(12);
      c.spend(2); c.spend(2); c.spend(y < 7 ? 3 : 2);
    }
    c.spend(2); c.spend(2);
    this.vic(4, 0x16, 0xc8);
    // Row 16 (lines $B3-$BA) has been displayed by now; the character shift that follows
    // must not reach it until the next frame.
    renderTo(this.clock.line + 1);
    this.scrollCharacters();
    // $1D9D: the shimmer colors of screen row 24.
    for (let x = 0; x < 40; x++) this.io[0xbc0 + x] = m[0x1e30 + x];
    this.rotateBottomColors();
    this.rotateTopColors();
    // $1B1E: the sprite IRQ resumes the pointer saved by the sprite text reader.
    m[0xb0] = m[0x1cc3];
    m[0xb1] = m[0x1cc4];
  }

  // $1A84
  scrollCharacters() {
    const m = this.memory;
    m[0xb0] = m[0x1b1c];
    m[0xb1] = m[0x1b1d];
    m[0x1b1b] = (m[0x1b1b] - 1) & 255;
    if (m[0x1b1b] !== 0xbf) {
      m[0x1b1c] = m[0xb0];
      m[0x1b1d] = m[0xb1];
      return;
    }
    m[0x1b1b] = 0xc7;
    for (let x = 0; x < 40; x++) m[0x0680 + x] = m[0x0681 + x];
    this.fetchScrollCharacter();
  }

  // $1DAB: every third frame the row-24 colors rotate right.
  rotateBottomColors() {
    const m = this.memory;
    if (m[0x1d8e] !== 2) {
      m[0x1d8e]++;
      return;
    }
    m[0x1d8e] = 0;
    const saved = m[0x193d] = m[0x1e57];
    for (let y = 0x26; y >= 0; y--) m[0x1e31 + y] = m[0x1e30 + y];
    m[0x1e30] = saved;
  }

  // $1DD5: every third frame the row-7 colors rotate left.
  rotateTopColors() {
    const m = this.memory;
    if (m[0x1dff] !== 2) {
      m[0x1dff]++;
      return;
    }
    m[0x1dff] = 0;
    const saved = m[0x193d] = m[0x1e04];
    for (let y = 0; y < 0x28; y++) m[0x1e04 + y] = m[0x1e05 + y];
    m[0x1e2b] = saved;
  }

  // $1B98: sprite scroll, row-16 color, music (played from the SID trace) and SPACE.
  spriteInterrupt() {
    const m = this.memory;
    this.rollSprites();
    m[0x1bb9]++;
    if (m[0x1bb9] === 0x18) {
      m[0x1bb9] = 0;
      this.loadSpriteCharacters();
    }
    // $1E5C: every fourth frame row 16 takes the first bar color.
    if (m[0x1e7a] !== 3) m[0x1e7a]++;
    else {
      m[0x1e7a] = 0;
      for (let x = 0; x < 40; x++) this.io[0xa80 + x] = m[0x19b2];
    }
    this.io[0x12] = LOGO_LINE;
    if (this.space) this.launch = true;
  }

  // $1BBA: shift the eight-row band of all eight sprites left by one pixel.
  rollSprites() {
    const m = this.memory;
    for (let x = 0; x < 0x18; x += 3) {
      let carry = 0;
      for (let sprite = 7; sprite >= 0; sprite--) {
        for (let column = 2; column >= 0; column--) {
          const address = 0x0800 + sprite * 64 + column + x;
          const value = (m[address] << 1) | carry;
          carry = value >> 8;
          m[address] = value & 255;
        }
      }
    }
  }

  // $1C0D: draw the next three characters into the hidden sprite 7 at $09C0.
  loadSpriteCharacters() {
    const m = this.memory;
    this.swapPointer();
    this.readSpriteText();
    for (let x = 0; x < 3; x++) {
      const address = 0x2000 + m[0x1cbd + x] * 8;
      m[0xb0] = address & 255;
      m[0xb1] = address >> 8;
      for (let y = 0; y < 8; y++) m[0x09c0 + m[0x1cc0] + y * 3] = m[address + y];
      m[0x1cc0]++;
    }
    m[0x1cc0] = 0;
    this.swapPointer();
  }

  // $1CA0: exchange $B0/$B1 with the saved pair at $1CC1.
  swapPointer() {
    const m = this.memory;
    const low = m[0xb0], high = m[0xb1];
    m[0xb0] = m[0x1cc1];
    m[0xb1] = m[0x1cc2];
    m[0x1cc1] = low;
    m[0x1cc2] = high;
    this.storePointer();
  }

  // $1C5C: read three characters from $3400. The original never advances the high
  // byte (it stores $B0 twice and tests $B1 for the carry), so it wraps inside $34xx.
  readSpriteText() {
    const m = this.memory;
    m[0xb0] = m[0x1cbb];
    m[0xb1] = m[0x1cbc];
    for (let x = 0; x < 3; x++) {
      const character = m[m[0xb0] | (m[0xb1] << 8)];
      if (character === 0) {
        this.resetSpriteText();
        return;
      }
      m[0x1cbd + x] = character;
      m[0xb0] = (m[0xb0] + 1) & 255;
      if (m[0xb1] === 0) m[0xb1] = 1;
    }
    m[0x1cbb] = m[0xb0];
    this.storePointer();
  }
}
