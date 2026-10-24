import { PALETTE } from './palette.js';
import { FIRST_VISIBLE_LINE, VISIBLE_HEIGHT, RASTER_LINES, CYCLES_PER_LINE } from './timing.js';

export const WIDTH = 384;
export const HEIGHT = VISIBLE_HEIGHT;

// Register numbers above the VIC's $00..$2e carry the eight sprite pointers.
export const POINTER_REGISTER = 0x40;

// A display frame begins at FIRST_VISIBLE_LINE, so the scroller's sprite rows in
// lines 254..262 and 0..11 of one NTSC field are drawn together. The models supply
// the VIC registers at that line plus timed writes; this follows the VIC's video
// counters, badlines, idle state and border flip-flops, so the opened borders and
// the IRQ's mid-line $d011 switch appear as they do on the C64.
export class C64Display {
  constructor(pixels) {
    this.pixels = pixels;
    this.colors = PALETTE.map(color =>
      (0xff000000 | ((color & 255) << 16) | (color & 0xff00) | (color >> 16)) >>> 0);
    this.cdata = new Uint8Array(40);
    this.cram = new Uint8Array(40);
    this.foreground = new Uint8Array(WIDTH);
    this.spriteData = new Uint32Array(8);
    this.spriteBits = new Int8Array(8);
    this.spriteStep = new Uint8Array(8);
  }

  draw(model) {
    const m = model.memory, io = model.io, events = model.events;
    const r = model.registers.slice();
    const bank = ((io[0xd00] ^ 3) & 3) * 16384;
    let next = 0;
    let vcbase = 0, vc = 0, rc = 0, display = false, den30 = false;
    let verticalBorder = model.verticalBorder;
    const dma = new Uint8Array(8), mcbase = new Uint8Array(8), expandPhase = new Uint8Array(8);
    // Sprites already running at the first visible line continue from their Y match.
    for (let s = 0; s < 8; s++) {
      if (!(r[0x15] & (1 << s))) continue;
      const rows = (FIRST_VISIBLE_LINE - 1 - r[s * 2 + 1] + RASTER_LINES) % RASTER_LINES;
      if (rows < 21) { dma[s] = 1; mcbase[s] = rows * 3; }
    }
    const apply = clock => {
      while (next < events.length && events[next].clock <= clock) {
        const event = events[next++];
        r[event.register] = event.value;
      }
    };
    for (let y = 0; y < HEIGHT; y++) {
      const line = (y + FIRST_VISIBLE_LINE) % RASTER_LINES;
      const lineClock = y * CYCLES_PER_LINE;
      apply(lineClock + 14);
      if (line === 0) vcbase = 0;
      if (line === 0x30) den30 = (r[0x11] & 16) !== 0;
      const badline = den30 && line >= 0x30 && line <= 0xf7 && (line & 7) === (r[0x11] & 7);
      vc = vcbase;
      if (badline) {
        display = true;
        rc = 0;
        const screen = bank + (r[0x18] >> 4) * 1024;
        for (let cell = 0; cell < 40; cell++) {
          this.cdata[cell] = m[screen + ((vc + cell) & 1023)];
          this.cram[cell] = io[0x800 + ((vc + cell) & 1023)] & 15;
        }
      }
      const rsel = r[0x11] & 8;
      if (line === (rsel ? 251 : 247)) verticalBorder = true;
      else if (line === (rsel ? 51 : 55) && (r[0x11] & 16)) verticalBorder = false;
      const pointers = [0, 1, 2, 3, 4, 5, 6, 7].map(s => r[POINTER_REGISTER + s]);
      this.spriteBits.fill(-1);
      this.renderLine(y, m, io, r, bank, apply, lineClock, vc, rc, display, verticalBorder,
        dma, mcbase, pointers);
      if (display) vc += 40;
      apply(lineClock + 58);
      if (rc === 7) {
        vcbase = vc;
        if (!badline) display = false;
      }
      if (display) rc = (rc + 1) & 7;
      for (let s = 0; s < 8; s++) {
        if (dma[s]) {
          expandPhase[s] = r[0x17] & (1 << s) ? expandPhase[s] ^ 1 : 0;
          if (!expandPhase[s]) mcbase[s] += 3;
          if (mcbase[s] >= 63) dma[s] = 0;
        }
        if (!dma[s] && (r[0x15] & (1 << s)) && r[s * 2 + 1] === (line & 255)) {
          dma[s] = 1;
          mcbase[s] = 0;
          expandPhase[s] = 0;
        }
      }
      apply(lineClock + 63);
      const bottom = r[0x11] & 8 ? 251 : 247;
      const top = r[0x11] & 8 ? 51 : 55;
      if (line === bottom) verticalBorder = true;
      else if (line === top && (r[0x11] & 16)) verticalBorder = false;
    }
    model.verticalBorderAfterDraw = verticalBorder;
  }

  renderLine(y, m, io, r, bank, apply, lineClock, vcStart, rc, display, verticalBorder,
    dma, mcbase, pointers) {
    let mainBorder = true;
    const row = y * WIDTH;
    for (let s = 0; s < 8; s++) {
      if (!dma[s]) continue;
      const address = bank + pointers[s] * 64 + mcbase[s];
      this.spriteData[s] = (m[address] << 16) | (m[address + 1] << 8) | m[address + 2];
    }
    for (let x = 0; x < WIDTH; x++) {
      apply(lineClock + 14 + (x >> 3));
      const control = r[0x16], vcontrol = r[0x11];
      const left = control & 8 ? 32 : 39;
      const right = control & 8 ? 352 : 343;
      if (x === right) mainBorder = true;
      if (x === left && !verticalBorder) mainBorder = false;
      // Sprite shift registers start where the X counter matches the register.
      for (let s = 0; s < 8; s++) {
        if (!dma[s] || this.spriteBits[s] >= 0) continue;
        const sx = r[s * 2] | ((r[0x10] >> s) & 1) << 8;
        if (x === sx + 8) { this.spriteBits[s] = 0; this.spriteStep[s] = 0; }
      }
      let color = r[0x21] & 15;
      let foreground = 0;
      const sx = x - 32 - (control & 7);
      if (x >= 32 && x < 352 && sx >= 0) {
        const cell = sx >> 3;
        const bitmap = vcontrol & 32, ecm = vcontrol & 64;
        let glyph, character = 0, ink = 0;
        if (display) {
          character = this.cdata[cell];
          ink = this.cram[cell];
          glyph = bitmap ? m[bank + ((r[0x18] & 8) << 10) + (((vcStart + cell) & 1023) << 3) + rc]
            : m[bank + ((r[0x18] >> 1) & 7) * 2048 + (ecm ? character & 63 : character) * 8 + rc];
        } else {
          glyph = m[bank + (ecm ? 0x39ff : 0x3fff)];
        }
        if (ecm && !bitmap) color = r[0x21 + (character >> 6)] & 15;
        const multicolor = (control & 16) && (bitmap || (ink & 8));
        const bit = sx & 7;
        if (ecm && (bitmap || (control & 16))) {
          // Invalid modes render black, though their foreground still masks sprites.
          foreground = multicolor ? Number(((glyph >> (6 - (bit & 6))) & 3) >= 2)
            : (glyph >> (7 - bit)) & 1;
          color = 0;
        } else if (multicolor) {
          const pair = (glyph >> (6 - (bit & 6))) & 3;
          foreground = Number(pair >= 2);
          if (pair) {
            color = bitmap ? [0, character >> 4, character & 15, ink][pair]
              : [0, r[0x22] & 15, r[0x23] & 15, ink & 7][pair];
          }
        } else {
          const set = (glyph >> (7 - bit)) & 1;
          foreground = set;
          if (bitmap) color = set ? character >> 4 : character & 15;
          else if (set) color = ink;
        }
      }
      this.foreground[x] = foreground;
      let spriteColor = -1;
      for (let s = 0; s < 8; s++) {
        const bits = this.spriteBits[s];
        if (bits < 0 || bits >= 24) continue;
        const mask = 1 << s;
        const multicolor = r[0x1c] & mask;
        const value = multicolor ? (this.spriteData[s] >> (22 - (bits & 30))) & 3
          : (this.spriteData[s] >> (23 - bits)) & 1;
        if (spriteColor < 0 && value && !((r[0x1b] & mask) && foreground)) {
          spriteColor = multicolor ? [0, r[0x25], r[0x27 + s], r[0x26]][value] & 15 : r[0x27 + s] & 15;
        } else if (spriteColor < 0 && value) spriteColor = -2;
        const expand = r[0x1d] & mask ? 2 : 1;
        if (++this.spriteStep[s] >= expand) {
          this.spriteStep[s] = 0;
          this.spriteBits[s]++;
        }
      }
      if (spriteColor >= 0) color = spriteColor;
      this.pixels[row + x] = this.colors[mainBorder ? r[0x20] & 15 : color];
    }
  }
}
