// The parts of the KERNAL screen editor that Intro/Editor I and the linker rely on:
// CHROUT ($FFD2) to the 40x25 screen at $0400, and line input with a blinking cursor.
const SCREEN = 0x0400;
const COLOR_CODES = {
  0x90: 0, 0x05: 1, 0x1c: 2, 0x9f: 3, 0x9c: 4, 0x1e: 5, 0x1f: 6, 0x9e: 7,
  0x81: 8, 0x95: 9, 0x96: 10, 0x97: 11, 0x98: 12, 0x99: 13, 0x9a: 14, 0x9b: 15
};
const BLINK_JIFFIES = 20;

export function screenCode(petscii) {
  if (petscii === 0xff) return 0x5e;
  if (petscii >= 0xc0) return petscii - 0x80;
  if (petscii >= 0xa0) return petscii - 0x40;
  if (petscii >= 0x60) return petscii - 0x20;
  if (petscii >= 0x40) return petscii - 0x40;
  return petscii;
}

// Maps a browser key to the PETSCII code the C64 keyboard would put in its buffer.
export function petsciiForKey(event) {
  const special = {
    Enter: 0x0d, Backspace: 0x14, Delete: 0x14, Insert: 0x94, Home: event.shiftKey ? 0x93 : 0x13,
    ArrowDown: 0x11, ArrowUp: 0x91, ArrowRight: 0x1d, ArrowLeft: 0x9d
  };
  if (event.key in special) return special[event.key];
  if (event.key.length !== 1) return null;
  const code = event.key.charCodeAt(0);
  if (code >= 0x61 && code <= 0x7a) return code - 0x20;
  if (code >= 0x41 && code <= 0x5a) return code + 0x80;
  if (code >= 0x20 && code <= 0x40) return code;
  return { '[': 0x5b, '£': 0x5c, ']': 0x5d, '^': 0x5e, '_': 0x5f }[event.key] ?? null;
}

export class KernalScreen {
  constructor(memory, io) {
    this.memory = memory;
    this.io = io;
    this.row = this.memory[0xd6];
    this.column = this.memory[0xd3] % 40;
    this.reverse = false;
    this.input = false;
    this.blink = 0;
    this.blinkOn = false;
    this.under = 0;
  }

  get color() { return this.memory[0x0286] & 15; }
  set color(value) { this.memory[0x0286] = value; }

  cell() { return this.row * 40 + this.column; }

  clear() {
    this.memory.fill(0x20, SCREEN, SCREEN + 1000);
    this.io.fill(this.color, 0x800, 0x800 + 1000);
    this.row = this.column = 0;
  }

  scrollUp() {
    this.memory.copyWithin(SCREEN, SCREEN + 40, SCREEN + 1000);
    this.memory.fill(0x20, SCREEN + 960, SCREEN + 1000);
    this.io.copyWithin(0x800, 0x800 + 40, 0x800 + 1000);
    this.io.fill(this.color, 0x800 + 960, 0x800 + 1000);
  }

  newLine() {
    this.column = 0;
    if (++this.row === 25) {
      this.row = 24;
      this.scrollUp();
    }
  }

  print(text) {
    for (const code of text) this.chrout(code);
  }

  chrout(code) {
    const color = COLOR_CODES[code];
    if (color !== undefined) this.color = color;
    else if (code === 0x0d || code === 0x8d) {
      this.reverse = false;
      this.newLine();
    } else if (code === 0x93) this.clear();
    else if (code === 0x13) this.row = this.column = 0;
    else if (code === 0x12) this.reverse = true;
    else if (code === 0x92) this.reverse = false;
    else if (code === 0x0e) this.io[0x18] |= 2;
    else if (code === 0x8e) this.io[0x18] &= ~2;
    else if (code === 0x11) {
      if (++this.row === 25) {
        this.row = 24;
        this.scrollUp();
      }
    } else if (code === 0x91) this.row = Math.max(0, this.row - 1);
    else if (code === 0x1d) {
      if (++this.column === 40) this.newLine();
    } else if (code === 0x9d) {
      if (this.column) this.column--;
      else if (this.row) {
        this.row--;
        this.column = 39;
      }
    } else if (code === 0x14) this.deleteLeft();
    else if (code === 0x94) this.insertSpace();
    else if ((code >= 0x20 && code < 0x80) || code >= 0xa0) {
      const cell = this.cell();
      this.memory[SCREEN + cell] = screenCode(code) | (this.reverse ? 0x80 : 0);
      this.io[0x800 + cell] = this.color;
      if (++this.column === 40) this.newLine();
    }
  }

  // DEL closes the gap on this row; at column 0 it continues from the row above,
  // as on a wrapped logical line.
  deleteLeft() {
    if (!this.column) {
      if (!this.row) return;
      this.row--;
      this.column = 40;
    }
    this.column--;
    const start = SCREEN + this.row * 40;
    this.memory.copyWithin(start + this.column, start + this.column + 1, start + 40);
    this.io.copyWithin(0x800 + this.row * 40 + this.column, 0x800 + this.row * 40 + this.column + 1,
      0x800 + this.row * 40 + 40);
    this.memory[start + 39] = 0x20;
  }

  insertSpace() {
    const start = SCREEN + this.row * 40;
    this.memory.copyWithin(start + this.column + 1, start + this.column, start + 39);
    this.io.copyWithin(0x800 + this.row * 40 + this.column + 1, 0x800 + this.row * 40 + this.column,
      0x800 + this.row * 40 + 39);
    this.memory[start + this.column] = 0x20;
  }

  // $E5CD: wait for keys with the cursor blinking every 20 jiffies.
  beginInput() {
    this.input = true;
    this.blink = 1;
    this.blinkOn = false;
  }

  // Returns true when RETURN ends the line.
  key(code) {
    if (!this.input) return false;
    this.hideCursor();
    if (code === 0x0d) {
      this.input = false;
      return true;
    }
    this.chrout(code);
    this.blink = 1;
    return false;
  }

  tick() {
    if (!this.input || --this.blink) return;
    this.blink = BLINK_JIFFIES;
    if (this.blinkOn) this.hideCursor();
    else this.showCursor();
  }

  showCursor() {
    const cell = this.cell();
    this.under = this.io[0x800 + cell];
    this.memory[SCREEN + cell] ^= 0x80;
    this.io[0x800 + cell] = this.color;
    this.blinkOn = true;
  }

  hideCursor() {
    if (!this.blinkOn) return;
    const cell = this.cell();
    this.memory[SCREEN + cell] ^= 0x80;
    this.io[0x800 + cell] = this.under;
    this.blinkOn = false;
  }
}
