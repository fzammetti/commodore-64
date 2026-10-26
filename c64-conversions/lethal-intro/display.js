import { PALETTE } from './palette.js';
import { FIRST_VISIBLE_LINE, VISIBLE_HEIGHT, RASTER_LINES, CYCLES_PER_LINE } from './timing.js';

export const WIDTH = 384;
export const HEIGHT = VISIBLE_HEIGHT;

// The left edge of the 384-pixel picture is fetched at cycle 14 of an NTSC line. A colour
// register written in cycle c shows from pixel (c - 14) * 8 + 9, as in VICE (6567R8).
const FIRST_PIXEL_CYCLE = 14;
const WRITE_DELAY = 9;
// Column n's screen code (on a badline) and glyph byte are read in cycle 15 + n; in VICE
// a store in that same cycle already counts.
const FIRST_FETCH_CYCLE = 15;
// Event targets: VIC-II registers below $40, then RAM and colour RAM writes.
const RAM = 0x10000, COLOR = 0x20000;

// Replays one frame against the model's memory as it stood when the frame began. The
// models supply timed events (clock = line * 65 + cycle): VIC-II register writes from
// the raster IRQ, and memory writes such as the starfield's glyph stores. Register
// writes take effect at the pixel the raster has reached; memory writes at the next
// fetch of the byte. So the raster bars land on the cycles the original wrote them, and
// the stars on the screen rows the raster had not reached yet move during the frame.
// Phaser presents the result as a texture.
export class C64Display {
  constructor(pixels, romFont) {
    this.pixels = pixels;
    this.font = romFont;
    this.registers = new Uint8Array(64);
    this.rowCodes = new Uint8Array(40);
    this.rowColors = new Uint8Array(40);
    this.glyphs = new Uint8Array(40);
    this.memory = new Uint8Array(65536);
    this.colorRam = new Uint8Array(1024);
    this.colors = PALETTE.map(color =>
      (0xff000000 | ((color & 255) << 16) | (color & 0xff00) | (color >> 16)) >>> 0);
  }

  // VIC-II bank 0 sees the character ROM at $1000-$1FFF.
  fetch(memory, address) {
    address &= 0x3fff;
    return (address & 0x3000) === 0x1000 ? this.font[address & 0x7ff] : memory[address];
  }

  draw(model) {
    const { events, vic } = model.view;
    // Work on copies, so the same frame can be drawn again.
    const memory = this.memory, colorRam = this.colorRam;
    memory.set(model.view.memory);
    colorRam.set(model.view.colorRam);
    const r = this.registers, pixels = this.pixels, colors = this.colors;
    const codes = this.rowCodes, rowColors = this.rowColors, glyphs = this.glyphs;
    const registerEvents = events.filter(event => event[1] < RAM);
    const memoryEvents = events.filter(event => event[1] >= RAM);
    r.set(vic);
    let nextRegister = 0, nextMemory = 0;
    const applyRegisters = clock => {
      while (nextRegister < registerEvents.length && registerEvents[nextRegister][0] <= clock) {
        const [, target, value] = registerEvents[nextRegister++];
        r[target] = value;
      }
    };
    const applyMemory = clock => {
      while (nextMemory < memoryEvents.length && memoryEvents[nextMemory][0] <= clock) {
        const [, target, value] = memoryEvents[nextMemory++];
        if (target < COLOR) memory[target - RAM] = value;
        else colorRam[target - COLOR] = value;
      }
    };
    for (let y = 0; y < HEIGHT; y++) {
      // Lines past 262 belong to the next frame's top border; events continue there.
      const line = y + FIRST_VISIBLE_LINE;
      const raster = line % RASTER_LINES;
      const lineStart = line * CYCLES_PER_LINE;
      const lineClock = lineStart + FIRST_PIXEL_CYCLE;
      const pixelClock = x => lineClock + ((x - WRITE_DELAY) >> 3);
      applyRegisters(pixelClock(0));
      const control = r[0x11];
      const rowLine = raster - 48 - (control & 7);
      const top = control & 8 ? 51 : 55, bottom = control & 8 ? 251 : 247;
      const open = (control & 16) && raster >= top && raster < bottom;
      const row = rowLine >> 3, pixelRow = rowLine & 7;
      const inRows = rowLine >= 0 && row < 25;
      if (inRows) {
        const screen = ((r[0x18] & 0xf0) << 6) + row * 40, font = (r[0x18] & 0x0e) << 10;
        for (let column = 0; column < 40; column++) {
          applyMemory(lineStart + FIRST_FETCH_CYCLE + column);
          if (!pixelRow) {
            codes[column] = this.fetch(memory, screen + column);
            rowColors[column] = colorRam[row * 40 + column] & 15;
          }
          glyphs[column] = this.fetch(memory, font + codes[column] * 8 + pixelRow);
        }
      }
      applyMemory(lineStart + CYCLES_PER_LINE - 1);
      for (let x = 0; x < WIDTH; x++) {
        if (nextRegister < registerEvents.length && registerEvents[nextRegister][0] <= pixelClock(x)) {
          applyRegisters(pixelClock(x));
        }
        const target = y * WIDTH + x;
        const scroll = r[0x16];
        const left = scroll & 8 ? 32 : 39, right = scroll & 8 ? 352 : 343;
        if (!open || x < left || x >= right) {
          pixels[target] = colors[r[0x20] & 15];
          continue;
        }
        let ink = r[0x21] & 15;
        const sx = x - 32 - (scroll & 7);
        if (sx >= 0 && inRows) {
          const column = sx >> 3, color = rowColors[column], glyph = glyphs[column];
          if ((scroll & 16) && (color & 8)) {
            const pair = (glyph >> (6 - (sx & 6))) & 3;
            if (pair) ink = [0, r[0x22] & 15, r[0x23] & 15, color & 7][pair];
          } else if ((glyph >> (7 - (sx & 7))) & 1) {
            ink = color;
          }
        }
        pixels[target] = colors[ink];
      }
    }
  }
}
