import { CYCLES_PER_FRAME } from './timing.js';

const RAM = 0x10000, COLOR = 0x20000;
const SINE = 0x0d00;

// Translation of Exodus' "Intro #3" (intro by Fantasy): the $0a00 setup draws the screen,
// enables six sprites and calls $3000, which installs the raster IRQ chain $302a (line 162)
// → $31a7 (line 218). The CPU then polls SPACE in an 11-cycle loop at $0aa8, so each IRQ
// starts 38 to 41 cycles into its line. The KERNAL's $0314 vector enters each handler and
// $ea81 leaves it.
export class IntroModel {
  constructor(ram, io, timing, entries) {
    this.memory = new Uint8Array(ram).slice();
    if (this.memory.length !== 65536) throw new Error('IntroModel requires 64 KiB of RAM.');
    this.colorRam = new Uint8Array(io.subarray(0x800, 0xc00)).map(value => value & 15);
    this.vic = new Uint8Array(64);
    this.vic.set(io.subarray(0, 47));
    this.timing = timing;
    this.entries = entries;
    this.frame = 0;
    this.base = 0;
    this.clock = 0;
    this.events = [];
    this.exitRequested = false;
    this.exited = false;
    this.view = {
      memory: this.memory.slice(), colorRam: this.colorRam.slice(), vic: this.vic.slice(), events: []
    };
  }

  requestExit() {
    this.exitRequested = true;
  }

  // ---- logging for the display ----

  write(clock, register, value) {
    this.vic[register] = value & 255;
    this.events.push([clock - this.base, register, value & 255]);
  }

  poke(address, value) {
    this.memory[address] = value;
    this.events.push([this.clock - this.base, RAM + address, value]);
  }

  pokeColor(index, value) {
    this.colorRam[index] = value & 15;
    this.events.push([this.clock - this.base, COLOR + index, value & 15]);
  }

  // Writes the handler's register values at the cycles VICE traced for this entry cycle
  // and leaves the clock at the last write.
  replay(handler, entry, values) {
    const { registers, clocks } = this.timing[handler];
    const times = clocks[entry];
    for (let index = 0; index < registers.length; index++) {
      this.write(this.base + times[index], registers[index], values[index]);
    }
    this.clock = this.base + times[times.length - 1];
  }

  // The SPACE loop's position when each IRQ arrives follows every cycle the handlers and
  // the music spend. VICE traced it for the first 36,057 frames (ten minutes); the
  // sequence then repeats.
  entry(frame, upper) {
    const { entries, first } = this.entries;
    const digit = parseInt(entries[frame % entries.length], 16);
    return first + (upper ? digit >> 2 : digit & 3);
  }

  // ---- IRQ A at line 162: raster bars behind the upper scroller ----

  // $302a: 24 lines of background colour from $30cf, starting with the scroller's fine
  // scroll $30ce (38 columns). The loop takes 60 cycles a line, so each colour starts five
  // cycles earlier than the one above it until a badline catches it up. The scroller's
  // letters are holes in solid characters, so the bars show through them. Then black and
  // $c8.
  upperBars() {
    const m = this.memory, values = [m[0x30cf], m[0x30ce]];
    for (let y = 1; y < 24; y++) values.push(m[0x30cf + y]);
    values.push(0, 0xc8);
    this.replay('302a', this.entry(this.frame, true), values);
    this.scrollUpper();
    this.cycleSpriteColors();
    // $316f: the pointer goes back to $3258 and the chain moves on to $31a7.
  }

  // $3071: the scroller moves two pixels a frame; every fourth frame row 15 shifts left
  // and the next character of the text at $2400 (pointer $3258) enters on the right. At
  // the closing zero the pointer goes back to $2400 and the first character enters.
  scrollUpper() {
    const m = this.memory;
    m[0x30ce] = (m[0x30ce] - 2) & 255;
    if (m[0x30ce] !== 0xbf) return;
    m[0x30ce] = 0xc7;
    for (let x = 0; x < 40; x++) this.poke(0x0658 + x, m[0x0659 + x]);
    this.enterCharacter(0x3258, 0x2400, 0x067f);
  }

  // Shared by both scrollers: the byte at the pointer enters the row's last column.
  enterCharacter(pointer, start, column) {
    const m = this.memory;
    let address = m[pointer] | (m[pointer + 1] << 8);
    if (!m[address]) address = start;
    this.poke(column, m[address]);
    address++;
    m[pointer] = address & 255;
    m[pointer + 1] = address >> 8;
  }

  // $3297: every third frame the six colours at $32e5 rotate left and colour the sprites.
  cycleSpriteColors() {
    const m = this.memory;
    if (m[0x3296] !== 2) {
      m[0x3296]++;
      return;
    }
    m[0x3296] = 0;
    const first = m[0x316e] = m[0x32e5];
    m.copyWithin(0x32e5, 0x32e6, 0x32eb);
    m[0x32ea] = first;
    for (let sprite = 0; sprite < 6; sprite++) this.write(this.clock, 0x27 + sprite, m[0x32e5 + sprite]);
  }

  // ---- IRQ B at line 218: the mountains, then the frame's work ----

  // $31a7: row 21's fine scroll $3257 for eight lines, then black and $c8.
  lowerScroll() {
    const m = this.memory;
    this.replay('31a7', this.entry(this.frame, false), [m[0x3257], 0, 0, 0xc8]);
    // $31d7: JSR $1067 plays the music (captured separately as SID writes).
    this.moveSprites();
    this.scrollLower();
    this.rotateBarColors();
    this.cycleTextColors();
    // $3289: SPACE alone reads $ef from $dc01 and leaves through $0b00.
    if (this.exitRequested) this.exited = true;
  }

  // $0c2d: each sprite's X is the sum of two sines plus $30 (the carry rotates into
  // $d010) and its Y the mean of a half and a whole sine plus $26. The four angles at
  // $0c9d step by $0c93-$0c96 from sprite to sprite and restart each frame from $0c99,
  // which steps by $0c8f-$0c92.
  moveSprites() {
    const m = this.memory;
    let high = this.vic[0x10];
    for (let sprite = 0; sprite < 8; sprite++) {
      const x = m[SINE + m[0x0c9d]] + m[SINE + m[0x0c9e]] + m[0x0c97];
      high = (high >> 1) | (x > 255 ? 0x80 : 0);
      this.write(this.clock, 0x10, high);
      this.write(this.clock, sprite * 2, x & 255);
      m[0x03] = m[SINE + m[0x0c9f]] >> 1;
      this.write(this.clock, sprite * 2 + 1, (((m[SINE + m[0x0ca0]] + m[0x03]) >> 1) + m[0x0c98]) & 255);
      for (let angle = 3; angle >= 0; angle--) m[0x0c9d + angle] = (m[0x0c9d + angle] + m[0x0c93 + angle]) & 255;
    }
    for (let angle = 3; angle >= 0; angle--) {
      m[0x0c99 + angle] = (m[0x0c99 + angle] + m[0x0c8f + angle]) & 255;
      m[0x0c9d + angle] = m[0x0c99 + angle];
    }
  }

  // $31e2: the mountains move a pixel a frame; every eighth frame row 21 shifts left and
  // the next of the characters "A" to "Z" at $323c (pointer $325a) enters on the right.
  scrollLower() {
    const m = this.memory;
    m[0x3257] = (m[0x3257] - 1) & 255;
    if (m[0x3257] !== 0xbf) return;
    m[0x3257] = 0xc7;
    for (let x = 0; x < 40; x++) this.poke(0x0748 + x, m[0x0749 + x]);
    this.enterCharacter(0x325a, 0x323c, 0x076f);
  }

  // $30e8: every third frame the 24 colours at $313e rotate left and those at $3156 right;
  // the first twelve of each are the next frame's bars.
  rotateBarColors() {
    const m = this.memory;
    if (m[0x30e7] !== 2) {
      m[0x30e7]++;
      return;
    }
    m[0x30e7] = 0;
    const first = m[0x316e] = m[0x313e];
    m.copyWithin(0x313e, 0x313f, 0x3157);
    m[0x3155] = first;
    const last = m[0x316e] = m[0x316d];
    m.copyWithin(0x3157, 0x3156, 0x316d);
    m[0x3156] = last;
    m.copyWithin(0x30cf, 0x313e, 0x314a);
    m.copyWithin(0x30db, 0x3156, 0x3162);
  }

  // $32ec: every fourth frame the 16 colours at $3339 rotate left and the first colours
  // rows 4 to 11, "IMPORTED BY" and "EXODUS".
  cycleTextColors() {
    const m = this.memory;
    if (m[0x32eb] !== 3) {
      m[0x32eb]++;
      return;
    }
    m[0x32eb] = 0;
    const first = m[0x316e] = m[0x3339];
    m.copyWithin(0x3339, 0x333a, 0x334a);
    m[0x3348] = first;
    for (let index = 160; index < 480; index++) this.pokeColor(index, m[0x3339]);
  }

  // ---- frame ----

  // A frame covers raster line 28 to line 27 of the next frame, and both IRQs fall inside
  // it. The second one's work runs on into the next frame's top border.
  step() {
    this.base = this.frame * CYCLES_PER_FRAME;
    this.events = [];
    this.view.memory.set(this.memory);
    this.view.colorRam.set(this.colorRam);
    this.view.vic.set(this.vic);
    this.upperBars();
    this.lowerScroll();
    this.view.events = this.events.sort((a, b) => a[0] - b[0]);
    this.frame++;
  }
}
