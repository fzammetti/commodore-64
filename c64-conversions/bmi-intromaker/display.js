import { PALETTE } from './palette.js';
import { FIRST_VISIBLE_LINE, VISIBLE_HEIGHT, CYCLES_PER_LINE } from './timing.js';

export const WIDTH = 384;
export const HEIGHT = VISIBLE_HEIGHT;

// Registers a model may change mid-frame through `rasterWrites` ({ clock, register, value },
// where clock counts cycles from the start of raster line 0).
const RASTER_REGISTERS = [0x11, 0x16, 0x18, 0x20, 0x21, 0x22, 0x23, 0x24];

// Renders the recovered VIC-II state line by line: standard, multicolor and extended-color
// text, bitmap modes and sprites. A model renders up to a raster line before its IRQ code
// changes memory, so each part of the screen shows the data the VIC fetched at that time.
export class C64Display {
  constructor(pixels, chargen) {
    this.pixels = pixels;
    this.chargen = chargen;
    this.foreground = new Uint8Array(WIDTH);
    this.spriteOwner = new Uint8Array(WIDTH);
    this.values = new Uint8Array(64);
    this.y = 0;
    this.nextEvent = 0;
    this.colors = PALETTE.map(color =>
      (0xff000000 | ((color & 255) << 16) | (color & 0xff00) | (color >> 16)) >>> 0);
  }

  // The VIC reads the character ROM at $1000-$1FFF of banks 0 and 2.
  fetch(memory, bank, address) {
    const offset = address & 0x3fff;
    if ((bank === 0 || bank === 2) && offset >= 0x1000 && offset < 0x2000) {
      return this.chargen[offset - 0x1000];
    }
    return memory[bank * 0x4000 + offset];
  }

  begin(model) {
    const registers = model.frameRegisters || model.io;
    for (const register of RASTER_REGISTERS) this.values[register] = registers[register];
    this.y = 0;
    this.nextEvent = 0;
  }

  // Render every visible line before raster line `line`.
  renderTo(model, line) {
    const end = Math.min(HEIGHT, line - FIRST_VISIBLE_LINE);
    for (; this.y < end; this.y++) this.drawLine(model, this.y);
  }

  finish(model) {
    for (; this.y < HEIGHT; this.y++) this.drawLine(model, this.y);
  }

  draw(model) {
    this.begin(model);
    this.finish(model);
  }

  drawLine(model, y) {
    const m = model.memory, io = model.io, values = this.values;
    const events = model.rasterWrites || [];
    const bank = (io[0xd00] ^ 3) & 3;
    // Lines past the frame end show the bottom border of the next frame.
    const line = y + FIRST_VISIBLE_LINE;
    const vcontrol = values[0x11];
    const top = vcontrol & 8 ? 51 : 55;
    const bottom = vcontrol & 8 ? 251 : 247;
    const active = line >= top && line < bottom && (vcontrol & 16);
    const yscroll = vcontrol & 7;
    this.foreground.fill(0);
    let lineRegisters = null;
    for (let x = 0; x < WIDTH; x++) {
      const clock = line * CYCLES_PER_LINE + 14 + (x >> 3);
      while (this.nextEvent < events.length && events[this.nextEvent].clock <= clock) {
        const event = events[this.nextEvent++];
        values[event.register] = event.value;
      }
      if (x === 0) lineRegisters = values.slice();
      const target = y * WIDTH + x;
      const control = values[0x16];
      const left = control & 8 ? 32 : 39;
      const right = control & 8 ? 352 : 343;
      this.pixels[target] = this.colors[values[0x20] & 15];
      if (!active || x < left || x >= right) continue;
      const bg = values[0x21] & 15;
      this.pixels[target] = this.colors[bg];
      // Display rows begin at the first bad line, $30 + YSCROLL.
      const sourceY = line - 48 - yscroll;
      if (sourceY < 0 || sourceY >= 200) continue;
      const sx = x - 32 - (control & 7);
      if (sx < 0 || sx >= 320) continue;
      const memoryControl = values[0x18];
      const screen = bank * 0x4000 + (memoryControl >> 4) * 1024;
      const cell = (sourceY >> 3) * 40 + (sx >> 3);
      const character = m[screen + cell];
      const color = io[0x800 + cell] & 15;
      const bitmap = vcontrol & 32;
      const extended = !bitmap && (vcontrol & 64);
      if (extended) this.pixels[target] = this.colors[values[[0x21, 0x22, 0x23, 0x24][character >> 6]] & 15];
      const row = sourceY & 7;
      const glyph = bitmap
        ? this.fetch(m, bank, (memoryControl & 8 ? 0x2000 : 0) + cell * 8 + row)
        : this.fetch(m, bank, ((memoryControl >> 1) & 7) * 2048 + (extended ? character & 63 : character) * 8 + row);
      const multicolor = (control & 16) && (bitmap || (color & 8));
      const bit = sx & 7;
      let set = (glyph >> (7 - bit)) & 1;
      let foreground = set;
      let ink = bitmap ? (set ? character >> 4 : character & 15) : color;
      if (multicolor) {
        const pair = (glyph >> (6 - (bit & 6))) & 3;
        set = pair !== 0;
        foreground = pair >= 2;
        ink = bitmap ? [bg, character >> 4, character & 15, color][pair]
          : [bg, values[0x22] & 15, values[0x23] & 15, color & 7][pair];
      }
      if (set || bitmap) this.pixels[target] = this.colors[ink];
      this.foreground[x] = Number(foreground);
    }
    this.drawSprites(model, y, line, lineRegisters, bank);
  }

  drawSprites(model, y, line, registers, bank) {
    const m = model.memory, io = model.io;
    if (!io[0x15]) return;
    this.spriteOwner.fill(255);
    const screen = bank * 0x4000 + (registers[0x18] >> 4) * 1024;
    const left = registers[0x16] & 8 ? 32 : 39, right = registers[0x16] & 8 ? 352 : 343;
    const vcontrol = registers[0x11];
    if (line < (vcontrol & 8 ? 51 : 55) || line >= (vcontrol & 8 ? 251 : 247)) return;
    for (let sprite = 0; sprite < 8; sprite++) {
      const mask = 1 << sprite;
      if (!(io[0x15] & mask)) continue;
      const yScale = io[0x17] & mask ? 2 : 1;
      // A sprite starts on the line after its Y coordinate matches the raster.
      const row = Math.floor((line - io[sprite * 2 + 1] - 1) / yScale);
      if (row < 0 || row >= 21) continue;
      const xOrigin = io[sprite * 2] + ((io[0x10] & mask) ? 256 : 0) + 8;
      const pointer = bank * 0x4000 + m[screen + 0x3f8 + sprite] * 64;
      const multicolor = io[0x1c] & mask;
      const xScale = io[0x1d] & mask ? 2 : 1;
      for (let bit = 0; bit < 24; bit += multicolor ? 2 : 1) {
        const byte = m[pointer + row * 3 + (bit >> 3)];
        const value = multicolor ? (byte >> (6 - (bit & 7))) & 3 : (byte >> (7 - (bit & 7))) & 1;
        if (!value) continue;
        const ink = multicolor ? [0, io[0x25] & 15, io[0x27 + sprite] & 15, io[0x26] & 15][value]
          : io[0x27 + sprite] & 15;
        for (let dx = 0; dx < (multicolor ? 2 : 1) * xScale; dx++) {
          const x = xOrigin + bit * xScale + dx;
          if (x < left || x >= right || x >= WIDTH) continue;
          if (this.spriteOwner[x] !== 255) continue;
          this.spriteOwner[x] = sprite;
          if (!(io[0x1b] & mask) || !this.foreground[x]) this.pixels[y * WIDTH + x] = this.colors[ink];
        }
      }
    }
  }
}
