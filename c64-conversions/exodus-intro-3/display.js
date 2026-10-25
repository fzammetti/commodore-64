import { PALETTE } from './palette.js';
import { FIRST_VISIBLE_LINE, VISIBLE_HEIGHT, RASTER_LINES, CYCLES_PER_LINE } from './timing.js';

export const WIDTH = 384;
export const HEIGHT = VISIBLE_HEIGHT;

// The left edge of the 384-pixel picture is fetched at cycle 14 of an NTSC line. A colour
// register written in cycle c shows from pixel (c - 14) * 8 + 9, as in VICE (6567R8).
const FIRST_PIXEL_CYCLE = 14;
const WRITE_DELAY = 9;
// A sprite whose Y register equals the raster line starts on the following line.
const SPRITE_Y_OFFSET = 1;
// The 38-column window (x 39-342) sits one pixel left of the character grid, so the
// mountains on row 21 stuck out of the grey block below them. By request, on that row it
// moves one pixel right (x 40-343), a deliberate departure from the C64.
const GROUND_ROW = 21;
// Event targets: VIC-II registers below $40, then RAM and colour RAM writes.
const RAM = 0x10000, COLOR = 0x20000;

// Replays one frame against the model's memory as it stood when the frame began. The
// models supply timed events (clock = line * 65 + cycle): VIC-II register writes from
// the raster IRQs and memory writes. So the raster bars land on the cycles the original
// wrote them. As on the VIC-II, a row's screen codes and colours are read on its badline
// and a sprite's row of data at the start of its line. Phaser presents the result as a
// texture.
export class C64Display {
  constructor(pixels, romFont) {
    this.pixels = pixels;
    this.font = romFont;
    this.registers = new Uint8Array(64);
    this.rowCodes = new Uint8Array(40);
    this.rowColors = new Uint8Array(40);
    this.spriteData = new Int32Array(8);
    this.spriteX = new Int32Array(8);
    this.colors = PALETTE.map(color =>
      (0xff000000 | ((color & 255) << 16) | (color & 0xff00) | (color >> 16)) >>> 0);
  }

  // VIC-II bank 0 sees the character ROM at $1000-$1FFF.
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
      const narrowShift = row === GROUND_ROW && rowLine >= 0 ? 1 : 0;
      const activeSprites = this.prepareSprites(memory, raster);
      for (let x = 0; x < WIDTH; x++) {
        if (next < events.length && events[next][0] <= pixelClock(x)) apply(pixelClock(x));
        const target = y * WIDTH + x;
        const scroll = r[0x16];
        const left = scroll & 8 ? 32 : 39 + narrowShift, right = scroll & 8 ? 352 : 343 + narrowShift;
        if (!open || x < left || x >= right) {
          pixels[target] = colors[r[0x20] & 15];
          continue;
        }
        let ink = r[0x21] & 15, foreground = false;
        const sx = x - 32 - (scroll & 7);
        if (sx >= 0 && rowLine >= 0 && row < 25) {
          const column = sx >> 3, color = rowColors[column];
          const glyph = this.fetch(memory, ((r[0x18] & 0x0e) << 10) + codes[column] * 8 + pixelRow);
          if ((scroll & 16) && (color & 8)) {
            const pair = (glyph >> (6 - (sx & 6))) & 3;
            if (pair) ink = [0, r[0x22] & 15, r[0x23] & 15, color & 7][pair];
            foreground = pair >= 2;
          } else if ((glyph >> (7 - (sx & 7))) & 1) {
            ink = color;
            foreground = true;
          }
        }
        if (activeSprites) {
          const sprite = this.spritePixel(activeSprites, x);
          if (sprite >= 0 && !((r[0x1b] >> (sprite & 7)) & 1 && foreground)) {
            const value = sprite >> 3;
            ink = value === 1 ? r[0x25] & 15 : value === 3 ? r[0x26] & 15 : r[0x27 + (sprite & 7)] & 15;
          }
        }
        pixels[target] = colors[ink];
      }
    }
  }

  // Latches each displayed sprite's 24-bit row for this raster line.
  prepareSprites(memory, raster) {
    const r = this.registers;
    let active = 0;
    const screen = (r[0x18] & 0xf0) << 6;
    for (let sprite = 0; sprite < 8; sprite++) {
      const mask = 1 << sprite;
      if (!(r[0x15] & mask)) continue;
      const tall = r[0x17] & mask ? 2 : 1;
      const offset = raster - r[sprite * 2 + 1] - SPRITE_Y_OFFSET;
      if (offset < 0 || offset >= 21 * tall) continue;
      const pointer = this.fetch(memory, screen + 0x3f8 + sprite) * 64 + Math.floor(offset / tall) * 3;
      this.spriteData[sprite] = (this.fetch(memory, pointer) << 16)
        | (this.fetch(memory, pointer + 1) << 8) | this.fetch(memory, pointer + 2);
      this.spriteX[sprite] = r[sprite * 2] + (r[0x10] & mask ? 256 : 0) + 8;
      active |= mask;
    }
    return active;
  }

  // Returns sprite | (colour source << 3) for the highest-priority opaque sprite, or -1.
  spritePixel(active, x) {
    const r = this.registers;
    for (let sprite = 0; sprite < 8; sprite++) {
      const mask = 1 << sprite;
      if (!(active & mask)) continue;
      const wide = r[0x1d] & mask ? 2 : 1;
      const offset = Math.floor((x - this.spriteX[sprite]) / wide);
      if (offset < 0 || offset >= 24) continue;
      const data = this.spriteData[sprite];
      const value = r[0x1c] & mask ? (data >> (22 - (offset & 0x1e))) & 3 : ((data >> (23 - offset)) & 1) * 2;
      if (value) return sprite | (value << 3);
    }
    return -1;
  }
}
