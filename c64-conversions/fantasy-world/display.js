import { PALETTE } from './palette.js';
import { FIRST_VISIBLE_LINE, VISIBLE_HEIGHT } from './timing.js';
export const WIDTH = 384;
export const HEIGHT = VISIBLE_HEIGHT;

// VIC character/bitmap/sprite rendering; the translated models supply raster register changes.
export class C64Display {
  constructor(pixels, romFont) {
    this.pixels = pixels;
    this.font = romFont;
    this.foreground = new Uint8Array(WIDTH * HEIGHT);
    this.colors = PALETTE.map(color =>
      (0xff000000 | ((color & 255) << 16) | (color & 0xff00) | (color >> 16)) >>> 0);
  }

  draw(model) {
    const m = model.memory;
    const io = model.io;
    const bank = ((io[0xd00] ^ 3) & 3) * 16384;
    const defaultScreen = bank + (io[0x18] >> 4) * 1024;
    this.foreground.fill(0);
    for (let y = 0; y < HEIGHT; y++) {
      const line = y + FIRST_VISIBLE_LINE;
      const at = (names, fallback) => {
        for (const name of names) if (model[name]) return model[name][line];
        return fallback;
      };
      const control = at(['d016ByRaster', 'controlByRaster'], io[0x16]);
      const vcontrol = at(['d011ByRaster'], io[0x11]);
      const screen = at(['screenByRaster', 'screenBaseByRaster'], defaultScreen);
      const font = at(['fontByRaster', 'characterBaseByRaster'], bank + ((io[0x18] >> 1) & 7) * 2048);
      const bg = at(['backgroundByRaster'], io[0x21]) & 15;
      const border = at(['borderByRaster'], io[0x20]) & 15;
      const left = control & 8 ? 32 : 39;
      const right = control & 8 ? 352 : 343;
      const active = line >= 51 && line <= 250 && (vcontrol & 16);
      for (let x = 0; x < WIDTH; x++) {
        this.pixels[y * WIDTH + x] = this.colors[active && x >= left && x < right ? bg : border];
      }
      if (!active) continue;
      const sourceY = model.sourceYByRaster ? model.sourceYByRaster[line] : line - 51;
      if (sourceY === 65535 || sourceY < 0 || sourceY >= 200) continue;
      const row = sourceY >> 3;
      const glyphRow = sourceY & 7;
      const scroll = at(['scrollXByRaster'], control & 7);
      const mc1 = at(['d022ByRaster', 'multicolor1ByRaster'], io[0x22]) & 15;
      const mc2 = at(['d023ByRaster', 'multicolor2ByRaster'], io[0x23]) & 15;
      const bitmap = vcontrol & 32;
      const bitmapBase = bank + ((io[0x18] & 8) ? 8192 : 0);
      for (let column = 0; column < 40; column++) {
        const cell = row * 40 + column;
        const character = model.screen && screen === 0x400 ? model.screen[cell] : m[screen + cell];
        const color = io[0x800 + cell] & 15;
        const address = font + character * 8 + glyphRow;
        const glyph = bitmap ? m[bitmapBase + cell * 8 + glyphRow]
          : (font === 0x1000 || font === 0x1800) && bank === 0
            ? this.font[(address - 0x1000) & 2047] : m[address];
        const multicolor = (control & 16) && (bitmap || (color & 8));
        for (let bit = 0; bit < 8; bit++) {
          const x = 32 + column * 8 + scroll + bit;
          if (x < left || x >= right) continue;
          let set = (glyph >> (7 - bit)) & 1;
          let ink = bitmap ? (set ? character >> 4 : character & 15) : color;
          if (multicolor) {
            const pair = (glyph >> (6 - (bit & 6))) & 3;
            set = pair !== 0;
            ink = bitmap ? [bg, character >> 4, character & 15, color][pair]
              : [bg, mc1, mc2, color & 7][pair];
          }
          if (set || bitmap) {
            const target = y * WIDTH + x;
            this.pixels[target] = this.colors[ink];
            this.foreground[target] = Number(set !== 0);
          }
        }
      }
    }
    this.drawSprites(model, defaultScreen, bank);
  }

  drawSprites(model, screen, bank) {
    const m = model.memory;
    const io = model.io;
    for (let sprite = 7; sprite >= 0; sprite--) {
      const mask = 1 << sprite;
      if (!(io[0x15] & mask)) continue;
      const xOrigin = io[sprite * 2] + ((io[0x10] & mask) ? 256 : 0) + 8;
      const yOrigin = io[sprite * 2 + 1] - FIRST_VISIBLE_LINE;
      const source = bank + m[screen + 0x3f8 + sprite] * 64;
      const multicolor = io[0x1c] & mask;
      const xScale = io[0x1d] & mask ? 2 : 1;
      const yScale = io[0x17] & mask ? 2 : 1;
      const colors = [0, io[0x25] & 15, io[0x27 + sprite] & 15, io[0x26] & 15];
      for (let row = 0; row < 21; row++) {
        for (let bit = 0; bit < 24; bit += multicolor ? 2 : 1) {
          const byte = m[source + row * 3 + (bit >> 3)];
          const value = multicolor ? (byte >> (6 - (bit & 7))) & 3 : (byte >> (7 - (bit & 7))) & 1;
          if (!value) continue;
          const color = multicolor ? colors[value] : io[0x27 + sprite] & 15;
          for (let dy = 0; dy < yScale; dy++) {
            const y = yOrigin + row * yScale + dy;
            if (y < 51 - FIRST_VISIBLE_LINE || y >= 251 - FIRST_VISIBLE_LINE) continue;
            for (let dx = 0; dx < (multicolor ? 2 : 1) * xScale; dx++) {
              const x = xOrigin + bit * xScale + dx;
              if (x < 32 || x >= 352) continue;
              const target = y * WIDTH + x;
              if (!(io[0x1b] & mask) || !this.foreground[target]) this.pixels[target] = this.colors[color];
            }
          }
        }
      }
    }
  }
}
