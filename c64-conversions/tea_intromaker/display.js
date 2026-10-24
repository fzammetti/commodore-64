import { PALETTE } from './palette.js';
import { FIRST_VISIBLE_LINE, VISIBLE_HEIGHT } from './timing.js';

export const WIDTH = 384;
export const HEIGHT = VISIBLE_HEIGHT;

// Every screen in this program is VIC character mode: 25 rows at YSCROLL 3, the
// default bank and no sprites. Models supply the screen, color RAM and glyphs that
// the VIC fetched, plus any border, background or $D016 values that change by raster.
export class C64Display {
  constructor(pixels) {
    this.pixels = pixels;
    this.colors = PALETTE.map(color =>
      (0xff000000 | ((color & 255) << 16) | (color & 0xff00) | (color >> 16)) >>> 0);
  }

  draw(view) {
    const { screen, color, font } = view;
    for (let y = 0; y < HEIGHT; y++) {
      const line = y + FIRST_VISIBLE_LINE;
      const border = this.colors[(view.borderByRaster?.[line] ?? view.border) & 15];
      const background = this.colors[(view.backgroundByRaster?.[line] ?? view.background) & 15];
      const control = view.d016ByRaster?.[line] ?? view.d016 ?? 0xc8;
      const left = control & 8 ? 32 : 39;
      const right = control & 8 ? 352 : 343;
      const sourceY = line - 51;
      const target = y * WIDTH;
      if (sourceY < 0 || sourceY >= 200) {
        this.pixels.fill(border, target, target + WIDTH);
        continue;
      }
      const row = (sourceY >> 3) * 40;
      for (let x = 0; x < WIDTH; x++) {
        if (x < left || x >= right) {
          this.pixels[target + x] = border;
          continue;
        }
        const sx = x - 32 - (control & 7);
        if (sx < 0) {
          this.pixels[target + x] = background;
          continue;
        }
        const cell = row + (sx >> 3);
        const glyph = font[screen[cell] * 8 + (sourceY & 7)];
        this.pixels[target + x] = (glyph >> (7 - (sx & 7))) & 1
          ? this.colors[color[cell] & 15] : background;
      }
    }
  }
}
