import { CYCLES_PER_LINE, FIRST_VISIBLE_LINE, VISIBLE_HEIGHT } from './timing.js';
import { PALETTE } from './palette.js';
export const WIDTH = 384;
export const HEIGHT = VISIBLE_HEIGHT;
// A traced CPU store reaches the displayed VIC pixels nine dots later. Using
// the bus clock directly makes every color/fine-scroll boundary nine pixels early.
export const VIC_WRITE_DELAY_PIXELS = 9;

// The recovered intro uses standard hires characters, with black foreground
// cutouts revealing the raster colors behind the logo and the credit lettering.
export class IntroDisplay {
  constructor(pixels) {
    this.pixels = pixels;
    this.indices = new Uint8Array(WIDTH * HEIGHT);
    this.colors = PALETTE.map(c => (0xff000000 | (c & 255) << 16 | (c & 0xff00) | c >> 16) >>> 0);
  }

  draw(model) {
    const m = model.memory, screen = model.screenMemory;
    const events = model.rasterWrites;
    let next = 0, border = 0, background = 0, control = 0xc8;
    for (let y = 0; y < HEIGHT; y++) {
      const raster = y + FIRST_VISIBLE_LINE;
      for (let x = 0; x < WIDTH; x++) {
        const clock = raster * CYCLES_PER_LINE + 14 + (x - VIC_WRITE_DELAY_PIXELS) / 8;
        while (next < events.length && events[next].clock <= clock) {
          const e = events[next++];
          if (e.register === 0x20) border = e.value & 15;
          if (e.register === 0x21) background = e.value & 15;
          if (e.register === 0x16) control = e.value;
        }
        const left = control & 8 ? 32 : 39, right = control & 8 ? 352 : 343;
        let ink = border;
        if (raster >= 51 && raster < 251 && x >= left && x < right) {
          ink = background;
          const sx = x - 32 - (control & 7), sy = raster - 51;
          if (sx >= 0 && sx < 320) {
            const cell = (sy >> 3) * 40 + (sx >> 3);
            const glyph = m[0x800 + screen[cell] * 8 + (sy & 7)];
            if (glyph & (128 >> (sx & 7))) ink = model.io[0x800 + cell] & 15;
          }
        }
        const target = y * WIDTH + x;
        this.indices[target] = ink;
        this.pixels[target] = this.colors[ink];
      }
    }
  }
}
