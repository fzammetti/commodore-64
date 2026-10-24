import { PALETTE } from './palette.js';
import { FIRST_VISIBLE_LINE, VISIBLE_HEIGHT, RASTER_LINES, CYCLES_PER_LINE } from './timing.js';

export const WIDTH = 384;
export const HEIGHT = VISIBLE_HEIGHT;

// The left edge of the 384-pixel picture is fetched at cycle 14 of an NTSC line.
const FIRST_PIXEL_CYCLE = 14;
// A sprite whose Y register equals the raster line starts on the following line.
const SPRITE_Y_OFFSET = 1;

// Replays one frame of VIC-II register writes against the recovered RAM. The models
// supply timed events (clock = line * 65 + cycle), so raster bars, the 38-column
// scroller border, character set switches and sprite colours change mid-frame at the
// cycle the original IRQs wrote them. Phaser presents the result as a texture.
export class C64Display {
  constructor(pixels, romFont) {
    this.pixels = pixels;
    this.font = romFont;
    this.registers = new Uint8Array(64);
    this.spriteData = new Int32Array(8);
    this.spriteX = new Int32Array(8);
    this.colors = PALETTE.map(color =>
      (0xff000000 | ((color & 255) << 16) | (color & 0xff00) | (color >> 16)) >>> 0);
  }

  // VIC-II view of memory: banks 0 and 2 see the character ROM at $1000-$1FFF.
  fetch(memory, bank, address) {
    address &= 0x3fff;
    if ((bank === 0 || bank === 0x8000) && (address & 0x3000) === 0x1000) {
      return this.font[address & 0x7ff];
    }
    return memory[bank | address];
  }

  draw(model) {
    const memory = model.memory, colorRam = model.colorRam, events = model.events;
    const r = this.registers, pixels = this.pixels, colors = this.colors;
    const bank = model.bank ?? 0;
    r.set(model.vic);
    let next = 0;
    for (let y = 0; y < HEIGHT; y++) {
      // Lines past 262 belong to the next frame's top border; events continue there.
      const line = y + FIRST_VISIBLE_LINE;
      const raster = line % RASTER_LINES;
      const lineClock = line * CYCLES_PER_LINE + FIRST_PIXEL_CYCLE;
      while (next < events.length && events[next][0] <= lineClock) {
        r[events[next][1]] = events[next][2];
        next++;
      }
      const control = r[0x11];
      const rowLine = raster - 48 - (control & 7);
      const top = control & 8 ? 51 : 55, bottom = control & 8 ? 251 : 247;
      const open = (control & 16) && raster >= top && raster < bottom;
      const activeSprites = this.prepareSprites(memory, bank, raster);
      const row = rowLine >> 3, pixelRow = rowLine & 7;
      for (let x = 0; x < WIDTH; x++) {
        const clock = lineClock + (x >> 3);
        while (next < events.length && events[next][0] <= clock) {
          r[events[next][1]] = events[next][2];
          next++;
        }
        const target = y * WIDTH + x;
        const scroll = r[0x16];
        const left = scroll & 8 ? 32 : 39, right = scroll & 8 ? 352 : 343;
        if (!open || x < left || x >= right) {
          pixels[target] = colors[r[0x20] & 15];
          continue;
        }
        let ink = r[0x21] & 15, foreground = false;
        const sx = x - 32 - (scroll & 7);
        if (sx >= 0 && rowLine >= 0 && row < 25) {
          const cell = row * 40 + (sx >> 3);
          const screen = (r[0x18] & 0xf0) << 6, font = (r[0x18] & 0x0e) << 10;
          const code = this.fetch(memory, bank, screen + cell);
          const color = colorRam[cell] & 15;
          const glyph = this.fetch(memory, bank, font + code * 8 + pixelRow);
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
          if (sprite >= 0) {
            const mask = 1 << (sprite & 7);
            if (!((r[0x1b] & mask) && foreground)) {
              const value = sprite >> 3;
              ink = value === 1 ? r[0x25] & 15 : value === 3 ? r[0x26] & 15 : r[0x27 + (sprite & 7)] & 15;
            }
          }
        }
        pixels[target] = colors[ink];
      }
    }
  }

  // Latches each displayed sprite's 24-bit row for this raster line.
  prepareSprites(memory, bank, raster) {
    const r = this.registers;
    let active = 0;
    const screen = (r[0x18] & 0xf0) << 6;
    for (let sprite = 0; sprite < 8; sprite++) {
      const mask = 1 << sprite;
      this.spriteData[sprite] = 0;
      if (!(r[0x15] & mask)) continue;
      const tall = r[0x17] & mask ? 2 : 1;
      const offset = raster - r[sprite * 2 + 1] - SPRITE_Y_OFFSET;
      if (offset < 0 || offset >= 21 * tall) continue;
      const pointer = this.fetch(memory, bank, screen + 0x3f8 + sprite) * 64 + Math.floor(offset / tall) * 3;
      this.spriteData[sprite] = (this.fetch(memory, bank, pointer) << 16)
        | (this.fetch(memory, bank, pointer + 1) << 8) | this.fetch(memory, bank, pointer + 2);
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
