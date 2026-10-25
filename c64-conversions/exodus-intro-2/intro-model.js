import { CYCLES_PER_FRAME } from './timing.js';

const RAM = 0x10000, COLOR = 0x20000;

// The idle loop at $0c20 is a 3-cycle JMP, so a handler starts 38 to 40 cycles into its
// line. VICE (x64sc, NTSC) shows which: the colour rotations in the previous handler's
// tail decide it. IRQ1's entry follows the music's cycle count and only moves writes that
// land in the border, so the model uses its most common entry.
const UPPER_ENTRY = 39;
const BAND_ENTRY = 40, BAND_ENTRY_AFTER_ROTATION = 39;
const LOWER_ENTRY = 39, LOWER_ENTRY_ONE_ROTATION = 38, LOWER_ENTRY_BOTH_ROTATIONS = 40;

// Translation of Exodus' "Intro #2" (intro by Fantasy, 11/24/88): the $0c00 setup leaves
// the CPU in a JMP loop, and the raster IRQ chain $183e (line 82) → $1ad5 (line 138) →
// $196a (line 202) does everything else. The KERNAL's $0314 vector enters each handler
// and $ea81 leaves it.
export class IntroModel {
  constructor(ram, io, timing) {
    this.memory = new Uint8Array(ram).slice();
    if (this.memory.length !== 65536) throw new Error('IntroModel requires 64 KiB of RAM.');
    this.colorRam = new Uint8Array(io.subarray(0x800, 0xc00)).map(value => value & 15);
    this.vic = new Uint8Array(64);
    this.vic.set(io.subarray(0, 47));
    this.timing = timing;
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
      const value = typeof values[index] === 'function' ? values[index]() : values[index];
      this.write(this.base + times[index], registers[index], value);
    }
    this.clock = this.base + times[times.length - 1];
  }

  // ---- IRQ1 at line 82: the upper logo ----

  // $183e: 16 lines of background colour from $18fe behind rows 4 and 5, which scroll by
  // $183b. Each pass of the line loop takes 61 cycles, so every colour starts four cycles
  // earlier than the one above it until a badline catches it up. Then black and $c8.
  upperBars() {
    const m = this.memory, values = [m[0x18fe], m[0x183b]];
    for (let y = 1; y < 16; y++) values.push(m[0x18fe + y]);
    values.push(0, 0, 0xc8);
    this.replay('183e', UPPER_ENTRY, values);
    return this.rotateUpperColors();
  }

  // $1917: every fourth frame the 24 colours at $18fe rotate right.
  rotateUpperColors() {
    const m = this.memory;
    if (m[0x1916] !== 3) {
      m[0x1916]++;
      return false;
    }
    m[0x1916] = 0;
    const last = m[0x1941] = m[0x1915];
    m.copyWithin(0x18ff, 0x18fe, 0x1915);
    m[0x18fe] = last;
    return true;
  }

  // ---- IRQ2 at line 138: the band behind the scroller ----

  // $1ad5: border and background take $1b7f for 24 lines, rows 11 to 13 use the $0800
  // character set and the scroller's fine scroll $1b7e. The line loop at $1afc also reads
  // $1b80-$1b96, but they are always zero, so it writes nothing.
  scrollerBand(entry) {
    const m = this.memory, vic = this.vic;
    this.replay('1ad5', entry, [
      m[0x1b7f], m[0x1b7f], m[0x1b7e], () => (vic[0x18] & 0xf0) | 0x02,
      0, 0, 0xc8, () => (vic[0x18] & 0xf0) | 0x08
    ]);
    const flash = this.rotateBandColors();
    const edges = this.rotateEdgeColors();
    return flash + edges;
  }

  // $1c0b: every second frame the 30 colours at $1bed rotate left; the first is the
  // next band colour. Seven of them are not black, so the band flashes once a second.
  rotateBandColors() {
    const m = this.memory;
    if (m[0x1c3b] !== 1) {
      m[0x1c3b]++;
      return 0;
    }
    m[0x1c3b] = 0;
    const first = m[0x1941] = m[0x1bed];
    m.copyWithin(0x1bed, 0x1bee, 0x1c0b);
    m[0x1c0a] = first;
    m[0x1b7f] = m[0x1bed];
    return 1;
  }

  // $1c3c: every third frame the 40 colours at $1c77 rotate left and the first colours
  // rows 0 and 24, "IMPORTED BY EXODUS" and "INTRO BY FANTASY". (The fill loop branches
  // back past its LDA, so one colour fills the whole row.)
  rotateEdgeColors() {
    const m = this.memory;
    if (m[0x1c76] !== 2) {
      m[0x1c76]++;
      return 0;
    }
    m[0x1c76] = 0;
    const first = m[0x1941] = m[0x1c77];
    m.copyWithin(0x1c77, 0x1c78, 0x1c9f);
    m[0x1c9e] = first;
    for (let x = 0; x < 40; x++) {
      this.pokeColor(x, m[0x1c77]);
      this.pokeColor(960 + x, m[0x1c77]);
    }
    return 1;
  }

  // ---- IRQ3 at line 202: the lower logo, then the frame's work ----

  // $196a: as $183e, for rows 19 and 20 with the colours at $1a29 and fine scroll $1967;
  // this loop takes 60 cycles a line.
  lowerBars(entry) {
    const m = this.memory, values = [m[0x1a29], m[0x1967]];
    for (let y = 1; y < 16; y++) values.push(m[0x1a29 + y]);
    values.push(0, 0, 0xc8);
    this.replay('196a', entry, values);
    this.rotateLowerColors();
    // $1a6d: JSR $1006 plays the music (captured separately as SID writes).
    this.colorScroller();
    this.bounceUpper();
    this.bounceUpper();
    this.scroll();
    this.bounceLower();
    this.bounceLower();
    // $1aa3: SPACE alone reads $ef from $dc01 and leaves through $0d00.
    if (this.exitRequested) this.exited = true;
  }

  // $1a42: every fourth frame the 24 colours at $1a29 rotate left.
  rotateLowerColors() {
    const m = this.memory;
    if (m[0x1a41] !== 3) {
      m[0x1a41]++;
      return;
    }
    m[0x1a41] = 0;
    const first = m[0x1a6c] = m[0x1a29];
    m.copyWithin(0x1a29, 0x1a2a, 0x1a42);
    m[0x1a40] = first;
  }

  // $1b98: every fourth frame the first of the 30 colours at $1bcf colours the scroller
  // row (again one colour for the row), then they rotate left.
  colorScroller() {
    const m = this.memory;
    if (m[0x1b97] !== 3) {
      m[0x1b97]++;
      return;
    }
    m[0x1b97] = 0;
    for (let x = 0; x < 40; x++) this.pokeColor(480 + x, m[0x1bcf]);
    const first = m[0x1941] = m[0x1bcf];
    m.copyWithin(0x1bcf, 0x1bd0, 0x1bee);
    m[0x1bec] = first;
  }

  // $1881 and $19ac move a logo one pixel through its fine scroll; past either end the
  // two rows shift a character, and after 24 characters the logo turns round. The rows
  // are copied in the original's order, so the right shift carries each row's last
  // character into the next row (always a black block).
  bounce(scroll, direction, counter, rows, countUp) {
    const m = this.memory;
    if (m[direction] === 0) {
      m[scroll]--;
      if (m[scroll] !== 0xbf) return;
      m[scroll] = 0xc7;
      for (let x = 0; x < 39; x++) {
        this.poke(rows + x, m[rows + 1 + x]);
        this.poke(rows + 40 + x, m[rows + 41 + x]);
      }
    } else {
      m[scroll]++;
      if (m[scroll] !== 0xc8) return;
      m[scroll] = 0xc0;
      for (let x = 39; x >= 0; x--) {
        this.poke(rows + 1 + x, m[rows + x]);
        this.poke(rows + 41 + x, m[rows + 40 + x]);
      }
    }
    if (countUp) {
      m[counter]++;
      if (m[counter] !== 0x18) return;
      m[counter] = 0;
    } else {
      m[counter]--;
      if (m[counter]) return;
      m[counter] = 0x18;
    }
    m[direction] = m[direction] ? 0 : 1;
  }

  // $1881: the upper logo (rows 4 and 5 at $28a0), counting $183d down from 24.
  bounceUpper() {
    this.bounce(0x183b, 0x183c, 0x183d, 0x28a0, false);
  }

  // $19ac: the lower logo (rows 19 and 20 at $2af8), counting $1969 up to 24.
  bounceLower() {
    this.bounce(0x1967, 0x1968, 0x1969, 0x2af8, true);
  }

  // $1b42: the scroller moves a pixel a frame; every eighth frame row 12 shifts left and
  // the next character of the text at $0e00 (pointer $b0) enters on the right. At the
  // closing zero the pointer goes back to $0e00 and no character is added that time.
  scroll() {
    const m = this.memory;
    m[0x1b7e]--;
    if (m[0x1b7e] !== 0xbf) return;
    m[0x1b7e] = 0xc7;
    for (let x = 0; x < 40; x++) this.poke(0x29e0 + x, m[0x29e1 + x]);
    const pointer = m[0xb0] | (m[0xb1] << 8), byte = m[pointer];
    if (!byte) {
      m[0xb0] = 0x00;
      m[0xb1] = 0x0e;
      return;
    }
    this.poke(0x2a07, byte);
    m[0xb0] = (m[0xb0] + 1) & 255;
    if (!m[0xb0]) m[0xb1]++;
  }

  // ---- frame ----

  // A frame covers raster line 28 to line 27 of the next frame, and all three IRQs fall
  // inside it.
  step() {
    this.base = this.frame * CYCLES_PER_FRAME;
    this.events = [];
    this.view.memory.set(this.memory);
    this.view.colorRam.set(this.colorRam);
    this.view.vic.set(this.vic);
    const rotated = this.upperBars();
    const rotations = this.scrollerBand(rotated ? BAND_ENTRY_AFTER_ROTATION : BAND_ENTRY);
    this.lowerBars([LOWER_ENTRY, LOWER_ENTRY_ONE_ROTATION, LOWER_ENTRY_BOTH_ROTATIONS][rotations]);
    this.view.events = this.events.sort((a, b) => a[0] - b[0]);
    this.frame++;
  }
}
