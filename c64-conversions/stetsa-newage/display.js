import { PALETTE } from './palette.js';
import { FIRST_VISIBLE_LINE, VISIBLE_HEIGHT, RASTER_LINES, CYCLES_PER_LINE } from './timing.js';

export const WIDTH = 384;
export const HEIGHT = VISIBLE_HEIGHT;

// The translated models supply the original VIC register events. Phaser presents
// this recovered character/bitmap/sprite display as a nearest-neighbor texture.
export class C64Display {
  constructor(pixels, romFont) {
    this.pixels = pixels;
    this.font = romFont;
    this.foreground = new Uint8Array(WIDTH * HEIGHT);
    this.spriteOwner = new Uint8Array(WIDTH * HEIGHT);
    this.colors = PALETTE.map(color =>
      (0xff000000 | ((color & 255) << 16) | (color & 0xff00) | (color >> 16)) >>> 0);
  }

  draw(model) {
    const m = model.memory, io = model.io;
    const bank = ((io[0xd00] ^ 3) & 3) * 16384;
    const defaultScreen = bank + (io[0x18] >> 4) * 1024;
    const events = model.rasterWrites || [];
    const registers = [0x16, 0x20, 0x21, 0x22, 0x23];
    const maps = [model.d016ByRaster, model.borderByRaster, model.backgroundByRaster,
      model.d022ByRaster || model.multicolor1ByRaster, model.d023ByRaster || model.multicolor2ByRaster];
    const values = new Uint8Array(64);
    for (let index = 0; index < registers.length; index++) {
      values[registers[index]] = maps[index]?.[0] ?? io[registers[index]];
    }
    const initialValues = values.slice();
    let nextEvent = 0;
    this.foreground.fill(0);
    for (let y = 0; y < HEIGHT; y++) {
      const raster = y + FIRST_VISIBLE_LINE;
      const line = raster % RASTER_LINES;
      if (raster === RASTER_LINES) {
        values.set(initialValues);
        nextEvent = 0;
      }
      const screen = model.screenByRaster?.[line] ?? defaultScreen;
      const font = model.fontByRaster?.[line] ?? bank + ((io[0x18] >> 1) & 7) * 2048;
      const vcontrol = model.d011ByRaster?.[line] ?? io[0x11];
      const bitmap = vcontrol & 32;
      const bitmapBase = model.bitmapBaseByRaster?.[line] ?? bank + ((io[0x18] & 8) ? 8192 : 0);
      const top = vcontrol & 8 ? 51 : 55;
      const bottom = vcontrol & 8 ? 251 : 247;
      const active = line >= top && line < bottom && (vcontrol & 16);
      const sourceY = model.sourceYByRaster?.[line] ?? line - 51;
      if (!events.length) {
        for (let index = 0; index < registers.length; index++) {
          values[registers[index]] = maps[index]?.[line] ?? io[registers[index]];
        }
      }
      for (let x = 0; x < WIDTH; x++) {
        const clock = line * CYCLES_PER_LINE + 14 + x / 8;
        while (nextEvent < events.length && (events[nextEvent].clock ?? events[nextEvent].cycle) <= clock) {
          const event = events[nextEvent++];
          if (event.register < values.length) values[event.register] = event.value;
        }
        const control = values[0x16];
        const left = control & 8 ? 32 : 39;
        const right = control & 8 ? 352 : 343;
        const bg = values[0x21] & 15;
        const target = y * WIDTH + x;
        this.pixels[target] = this.colors[values[0x20] & 15];
        if (!active || x < left || x >= right) continue;
        this.pixels[target] = this.colors[bg];
        if (sourceY < 0 || sourceY >= 200) continue;
        const sx = x - 32 - (control & 7);
        if (sx < 0 || sx >= 320) continue;
        const cell = (sourceY >> 3) * 40 + (sx >> 3);
        const address = screen + cell;
        const oldScroller = model.previousScrollerMemory && address >= 0x05e0 && address < 0x0608;
        // A model may retain the screen as the VIC saw it before a later IRQ updated RAM.
        const character = oldScroller ? model.previousScrollerMemory[address - 0x05e0]
          : model.screenMemory?.[cell] ?? m[address];
        const color = (oldScroller ? model.previousScrollerColor : io[0x800 + cell]) & 15;
        const glyphAddress = font + character * 8 + (sourceY & 7);
        const rom = (bank === 0 || bank === 32768) && (font & 0x3fff) >= 0x1000
          && (font & 0x3fff) < 0x2000;
        const glyph = bitmap ? m[bitmapBase + cell * 8 + (sourceY & 7)]
          : rom ? this.font[glyphAddress & 0x7ff] : m[glyphAddress];
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
        this.foreground[target] = Number(foreground);
      }
    }
    this.drawSprites(model, defaultScreen, bank);
  }

  drawSprites(model, screen, bank) {
    const m = model.memory, io = model.io;
    this.spriteOwner.fill(255);
    for (let sprite = 0; sprite < 8; sprite++) {
      const mask = 1 << sprite;
      if (!(io[0x15] & mask)) continue;
      const xOrigin = io[sprite * 2] + ((io[0x10] & mask) ? 256 : 0) + 8;
      const pointer = bank + m[screen + 0x3f8 + sprite] * 64;
      const multicolor = io[0x1c] & mask;
      const xScale = io[0x1d] & mask ? 2 : 1;
      const yScale = io[0x17] & mask ? 2 : 1;
      for (let y = 23; y < 223; y++) {
        const raster = y + FIRST_VISIBLE_LINE;
        const spriteY = model.previousSpriteY !== undefined && raster < 230
          ? model.previousSpriteY : io[sprite * 2 + 1];
        const row = Math.floor((raster - spriteY) / yScale);
        if (row < 0 || row >= 21) continue;
        for (let bit = 0; bit < 24; bit += multicolor ? 2 : 1) {
          const address = pointer + row * 3 + (bit >> 3);
          const offset = address - 0x0800;
          const old = model.previousSpriteMemory && offset >= 0 && offset < 512
            && raster < model.spriteWriteRasters[offset];
          const byte = old ? model.previousSpriteMemory[offset] : m[address];
          const value = multicolor ? (byte >> (6 - (bit & 7))) & 3 : (byte >> (7 - (bit & 7))) & 1;
          if (!value) continue;
          const ink = multicolor ? [0, io[0x25] & 15, io[0x27 + sprite] & 15, io[0x26] & 15][value]
            : io[0x27 + sprite] & 15;
          for (let dx = 0; dx < (multicolor ? 2 : 1) * xScale; dx++) {
            const x = xOrigin + bit * xScale + dx;
            if (x < 32 || x >= 352) continue;
            const target = y * WIDTH + x;
            if (this.spriteOwner[target] !== 255) continue;
            this.spriteOwner[target] = sprite;
            if (!(io[0x1b] & mask) || !this.foreground[target]) this.pixels[target] = this.colors[ink];
          }
        }
      }
    }
  }
}
