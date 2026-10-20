import { PALETTE } from "./model.js";
import { CYCLES_PER_LINE, FIRST_VISIBLE_LINE, FIRST_VISIBLE_CYCLE, VISIBLE_HEIGHT } from "./timing.js";

export const WIDTH = 384;
export const HEIGHT = VISIBLE_HEIGHT;


function rasterMaps(inEvents) {
  const maps = {};
  for (const kind of [`border`, `background`]) {
    const events = inEvents.map(function (inEvent) {
      return {
        clock: inEvent[0] * CYCLES_PER_LINE + inEvent[1] + (kind === `background` ? inEvent[3] : 0),
        address: inEvent[2]
      };
    }).sort(function (inLeft, inRight) { return inLeft.clock - inRight.clock; });
    const map = new Int32Array(WIDTH * HEIGHT);
    let event = 0;
    let address = -1;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const clock = (y + FIRST_VISIBLE_LINE) * CYCLES_PER_LINE + FIRST_VISIBLE_CYCLE + x / 8;
        while (event < events.length && events[event].clock <= clock) {
          address = events[event].address;
          event++;
        }
        map[y * WIDTH + x] = address;
      }
    }
    maps[kind] = map;
  }
  return maps;
}


export class C64Display {

  constructor(inPixels, inRomFont, inRasters = {}) {
    this.pixels = inPixels;
    this.font = inRomFont;
    this.colors = PALETTE.map(function (inColor) {
      return (0xff000000 | ((inColor & 255) << 16) | (inColor & 0x00ff00) | (inColor >> 16)) >>> 0;
    });
    this.foreground = new Uint8Array(WIDTH * HEIGHT);
    this.rasters = {};
    this.scrollEnds = {};
    for (const [name, events] of Object.entries(inRasters)) {
      this.rasters[name] = rasterMaps(events);
      this.scrollEnds[name] = events[events.length - 1][0] + 1;
    }
  }

  draw(inModel, inName, inStartup = false) {
    const m = inModel.memory;
    const io = inModel.io;
    const pixels = this.pixels;
    this.foreground.fill(0);
    const bank = ((io[0xd00] ^ 3) & 3) * 16384;
    const screen = bank + ((io[0x018] >> 4) & 15) * 1024;
    const raster = inStartup ? null : this.rasters[inName];
    for (let y = 0; y < HEIGHT; y++) {
      const line = y + FIRST_VISIBLE_LINE;
      let control = io[0x016];
      let characterBase = bank + ((io[0x018] >> 1) & 7) * 2048;
      if (!inStartup && inName === `fantasy` && m[0x424b] && line >= 218 && line < this.scrollEnds[inName]) {
        characterBase = 0x3800;
        control = m[0x4343];
      } else if (!inStartup && inName === `infiltrator` && line >= 192 && line < this.scrollEnds[inName]) {
        characterBase = 0x3800;
        control = m[0x72bc];
      }
      const left = control & 8 ? 32 : 39;
      const right = control & 8 ? 352 : 343;
      const defaultBackground = io[0x021] & 15;
      const defaultBorder = io[0x020] & 15;
      const useRaster = raster && !(inName === `fantasy` && !m[0x424b] && line >= 218);
      const active = line >= 51 && line <= 250 && (io[0x011] & 16);
      for (let x = 0; x < WIDTH; x++) {
        const position = y * WIDTH + x;
        const map = active && x >= left && x < right ? `background` : `border`;
        let color = map === `background` ? defaultBackground : defaultBorder;
        if (useRaster) {
          const address = raster[map][position];
          color = address < 0 ? 0 : m[address] & 15;
        }
        pixels[position] = this.colors[color];
      }
      if (line < 51 || line > 250 || !(io[0x011] & 16)) {
        continue;
      }
      const row = (line - 51) >> 3;
      const glyphRow = (line - 51) & 7;
      const offset = control & 7;
      for (let column = 0; column < 40; column++) {
        const cell = row * 40 + column;
        const character = m[screen + cell];
        const color = io[0x800 + cell] & 15;
        const address = characterBase + character * 8 + glyphRow;
        const glyph = characterBase === 0x1000 || characterBase === 0x1800
          ? this.font[(address - 0x1000) & 2047] : m[address];
        const multicolor = (control & 16) && (color & 8);
        for (let bit = 0; bit < 8; bit++) {
          const x = 32 + column * 8 + offset + bit;
          if (x < left || x >= right) {
            continue;
          }
          let ink = color;
          let set = (glyph >> (7 - bit)) & 1;
          if (multicolor) {
            const pair = (glyph >> (6 - (bit & 6))) & 3;
            set = pair !== 0;
            ink = [defaultBackground, io[0x022] & 15, io[0x023] & 15, color & 7][pair];
          }
          if (set) {
            pixels[y * WIDTH + x] = this.colors[ink];
            this.foreground[y * WIDTH + x] = 1;
          }
        }
      }
    }
    this.drawSprites(inModel, screen, bank);
  }

  drawSprites(inModel, inScreen, inBank) {
    const m = inModel.memory;
    const io = inModel.io;
    for (let sprite = 7; sprite >= 0; sprite--) {
      const mask = 1 << sprite;
      if (!(io[0x015] & mask)) {
        continue;
      }
      const xOrigin = io[sprite * 2] + ((io[0x010] & mask) ? 256 : 0) + 8;
      const yOrigin = io[sprite * 2 + 1] - FIRST_VISIBLE_LINE;
      const source = inBank + m[inScreen + 0x3f8 + sprite] * 64;
      const multicolor = io[0x01c] & mask;
      const xScale = io[0x01d] & mask ? 2 : 1;
      const yScale = io[0x017] & mask ? 2 : 1;
      const colors = [0, io[0x025] & 15, io[0x027 + sprite] & 15, io[0x026] & 15];
      for (let row = 0; row < 21; row++) {
        for (let bit = 0; bit < 24; bit += multicolor ? 2 : 1) {
          const byte = m[source + row * 3 + (bit >> 3)];
          const value = multicolor ? (byte >> (6 - (bit & 7))) & 3 : (byte >> (7 - (bit & 7))) & 1;
          if (!value) {
            continue;
          }
          const color = multicolor ? colors[value] : io[0x027 + sprite] & 15;
          for (let dy = 0; dy < yScale; dy++) {
            const y = yOrigin + row * yScale + dy;
            if (y < 51 - FIRST_VISIBLE_LINE || y >= 251 - FIRST_VISIBLE_LINE) {
              continue;
            }
            const width = (multicolor ? 2 : 1) * xScale;
            for (let dx = 0; dx < width; dx++) {
              const x = xOrigin + bit * xScale + dx;
              if (x < 32 || x >= 352) {
                continue;
              }
              const target = y * WIDTH + x;
              if (!(io[0x01b] & mask) || !this.foreground[target]) {
                this.pixels[target] = this.colors[color];
              }
            }
          }
        }
      }
    }
  }

}
