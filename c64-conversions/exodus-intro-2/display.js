import { PALETTE } from './palette.js';
import { FIRST_VISIBLE_LINE, VISIBLE_HEIGHT, RASTER_LINES, CYCLES_PER_LINE } from './timing.js';

export const WIDTH = 384;
export const HEIGHT = VISIBLE_HEIGHT;

// The left edge of the 384-pixel picture is fetched at cycle 14 of an NTSC line. A colour
// register written in cycle c shows from pixel (c - 14) * 8 + 9, as in VICE (6567R8).
const FIRST_PIXEL_CYCLE = 14;
const WRITE_DELAY = 9;
// Event targets: VIC-II registers below $40, then RAM and colour RAM writes.
const RAM = 0x10000, COLOR = 0x20000;

// Replays one frame against the model's memory as it stood when the frame began. The
// models supply timed events (clock = line * 65 + cycle): VIC-II register writes from
// the raster IRQs and the main loop's memory writes. So the colour splits land on the
// cycles the original wrote them, and the starfield glyphs change while the raster
// passes. As on the VIC-II, a row's screen codes and colours are read on its badline.
// Phaser presents the result as a texture.
export class C64Display {
  constructor(pixels, romFont) {
    this.pixels = pixels;
    this.font = romFont;
    this.registers = new Uint8Array(64);
    this.rowCodes = new Uint8Array(40);
    this.rowColors = new Uint8Array(40);
    this.colors = PALETTE.map(color =>
      (0xff000000 | ((color & 255) << 16) | (color & 0xff00) | (color >> 16)) >>> 0);
  }

  // VIC-II bank 0 (both screens use it) sees the character ROM at $1000-$1FFF.
  fetch(memory, address) {
    address &= 0x3fff;
    return (address & 0x3000) === 0x1000 ? this.font[address & 0x7ff] : memory[address];
  }

  draw(model) {
    const { memory, colorRam, events, vic } = model.view;
    const r = this.registers, pixels = this.pixels, colors = this.colors;
    const codes = this.rowCodes, rowColors = this.rowColors;
    r.set(vic);
    let next = 0;
    const apply = clock => {
      while (next < events.length && events[next][0] <= clock) {
        const [, target, value] = events[next++];
        if (target < RAM) r[target] = value;
        else if (target < COLOR) memory[target - RAM] = value;
        else colorRam[target - COLOR] = value;
      }
    };
    for (let y = 0; y < HEIGHT; y++) {
      // Lines past 262 belong to the next frame's top border; events continue there.
      const line = y + FIRST_VISIBLE_LINE;
      const raster = line % RASTER_LINES;
      const lineClock = line * CYCLES_PER_LINE + FIRST_PIXEL_CYCLE;
      const pixelClock = x => lineClock + ((x - WRITE_DELAY) >> 3);
      apply(pixelClock(0));
      const control = r[0x11];
      const rowLine = raster - 48 - (control & 7);
      const top = control & 8 ? 51 : 55, bottom = control & 8 ? 251 : 247;
      const open = (control & 16) && raster >= top && raster < bottom;
      const row = rowLine >> 3, pixelRow = rowLine & 7;
      if (rowLine >= 0 && row < 25 && !pixelRow) {
        const screen = ((r[0x18] & 0xf0) << 6) + row * 40;
        for (let column = 0; column < 40; column++) {
          codes[column] = this.fetch(memory, screen + column);
          rowColors[column] = colorRam[row * 40 + column] & 15;
        }
      }
      for (let x = 0; x < WIDTH; x++) {
        if (next < events.length && events[next][0] <= pixelClock(x)) apply(pixelClock(x));
        const target = y * WIDTH + x;
        const scroll = r[0x16];
        const left = scroll & 8 ? 32 : 39, right = scroll & 8 ? 352 : 343;
        if (!open || x < left || x >= right) {
          pixels[target] = colors[r[0x20] & 15];
          continue;
        }
        let ink = r[0x21] & 15;
        const sx = x - 32 - (scroll & 7);
        if (sx >= 0 && rowLine >= 0 && row < 25) {
          const column = sx >> 3, color = rowColors[column];
          const glyph = this.fetch(memory, ((r[0x18] & 0x0e) << 10) + codes[column] * 8 + pixelRow);
          if ((scroll & 16) && (color & 8)) {
            const pair = (glyph >> (6 - (sx & 6))) & 3;
            if (pair) ink = [0, r[0x22] & 15, r[0x23] & 15, color & 7][pair];
          } else if ((glyph >> (7 - (sx & 7))) & 1) ink = color;
        }
        pixels[target] = colors[ink];
      }
    }
  }
}
