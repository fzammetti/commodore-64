import { CYCLES_PER_LINE, CYCLES_PER_FRAME } from './timing.js';

const at = (line, cycle) => line * CYCLES_PER_LINE + cycle;

// The main loop runs in whatever each NTSC frame leaves after the raster IRQs and VIC
// DMA. irq-cycles.bin holds the chain's CPU cycles for every frame of the music loop
// (they vary with the player and the every-4th/5th/6th/8th-frame work). Badlines and
// sprite fetches take 1,536 more, and 5,500 cycles run between CLI and the first IRQ.
// Fitted against VICE, 119 of 121 traced fade writes land on the same frame.
const DMA_CYCLES = 1536;
const FIRST_FRAME_CYCLES = 5500;

// Main-loop costs counted from the recovered routines (CPU cycles, IRQs excluded).
const CLEAR_ROW = 1086;         // $18bd blanks row 23 and its colours
const HOME_AND_BLACK = 1114;    // $183c: HOME, PLOT 23,0 and $18ef
const PRINT = 14000;            // $ab1e STROUT of one 40-byte message
const FADE_STEP = 59759;        // $1966 colour fill and one $18fd delay
const HOLD = 59754 + 6 + 2297614;   // last fade-in step and the $1910 delay
const GAP = 59754 + 711537;     // last fade-out step, twelve $18fd delays, $18dc
const RESTART = 21;             // $182e clears the counters

// Translation of the SFI intro by Excelsior: $2600 setup, the $2904 → $29ea → $2a69
// → $2bab → $2d0e → $2d80 raster IRQ chain, and the $1800 message printer.
export class IntroModel {
  constructor(ram, io, irqCycles, loopStart) {
    this.memory = new Uint8Array(ram).slice();
    this.irqCycles = irqCycles;
    this.loopStart = loopStart;
    this.colorRam = new Uint8Array(io.subarray(0x800, 0xc00)).map(value => value & 15);
    if (this.memory.length !== 65536) throw new Error('IntroModel requires 64 KiB of RAM.');
    this.vic = new Uint8Array(64);
    this.vic.set(io.subarray(0, 47));
    this.vicEnd = this.vic.slice();
    this.events = [];
    this.frame = 0;
    this.exitRequested = false;
    this.exited = false;
    this.main = this.messageProgram();
    this.operation = 0;
    this.budget = 0;
  }

  // ---- main loop: $1800 prints five messages on row 23 and fades them ----

  messageProgram() {
    const m = this.memory;
    const operations = [];
    const add = (cost, effect = null) => operations.push({ cost, effect });
    add(9 * 2 + 3 + RESTART);
    for (let message = 0; message < 5; message++) {
      const text = 0x0a00 + m[0x1824 + message];
      add(CLEAR_ROW, () => this.clearRow());
      add(HOME_AND_BLACK, () => this.fillRow(0));
      let column = 0, length = 0;
      while (m[text + length]) length++;
      for (let index = 0; index < length; index++) {
        const byte = m[text + index];
        const position = byte === 0x05 ? -1 : column++;
        add(PRINT / length, () => this.chrout(byte, position));
      }
      for (let step = 0; m[0x180c + step] !== 0xff; step++) {
        const color = m[0x180c + step];
        add(m[0x180c + step + 1] === 0xff ? HOLD : FADE_STEP, () => this.fade(color));
      }
      for (let step = 0; m[0x1818 + step] !== 0xff; step++) {
        const color = m[0x1818 + step];
        add(m[0x1818 + step + 1] === 0xff ? GAP : FADE_STEP, () => this.fade(color));
      }
    }
    // After the fifth message $1844 meets $ff and $182e starts over.
    add(CLEAR_ROW, () => this.clearRow());
    add(HOME_AND_BLACK + RESTART, () => this.fillRow(0));
    this.restartOperation = 1;
    return operations;
  }

  clearRow() {
    this.memory.fill(0x20, 0x0798, 0x07c0);
    this.colorRam.fill(0, 920, 960);
  }

  // $18ef (colour 0) and $1966 write all forty colours of row 23.
  fillRow(color) {
    this.colorRam.fill(color & 15, 920, 960);
  }

  // $1966 with the next entry of the $180c fade-in or $1818 fade-out table.
  fade(color) {
    this.fillRow(color);
  }

  // KERNAL CHROUT at row 23: $05 selects white, other bytes become screen codes in
  // the current colour ($0286, brown from $2660 until the first $05).
  chrout(byte, column) {
    const m = this.memory;
    if (byte === 0x05) {
      m[0x0286] = 1;
      return;
    }
    const code = byte < 0x40 ? byte : byte < 0x60 ? byte - 0x40 : byte < 0x80 ? byte - 0x20 : byte & 0x7f;
    m[0x0798 + column] = code;
    this.colorRam[920 + column] = m[0x0286] & 15;
  }

  irqCyclesBefore(frame) {
    const table = this.irqCycles, index = frame - 1;
    if (index < table.length) return table[index];
    return table[this.loopStart + (index - this.loopStart) % (table.length - this.loopStart)];
  }

  runMainLoop() {
    if (this.frame === 1) this.budget = FIRST_FRAME_CYCLES;
    this.budget += CYCLES_PER_FRAME - DMA_CYCLES - this.irqCyclesBefore(this.frame);
    while (this.budget > 0) {
      const operation = this.main[this.operation];
      operation.effect?.();
      this.budget -= operation.cost;
      this.operation++;
      if (this.operation === this.main.length) this.operation = this.restartOperation;
    }
  }

  // ---- raster IRQ helpers ----

  write(clock, register, value) {
    this.events.push([clock, register, value & 255]);
  }

  // The colour-bar loops write $d020 and $d021 once per line from a table.
  bars(table, count, first, loop, period, last) {
    const m = this.memory;
    this.write(first, 0x20, m[table]);
    this.write(first + 4, 0x21, m[table]);
    for (let index = 1; index < count; index++) {
      const clock = loop + (index - 1) * period;
      this.write(clock, 0x20, m[table + index]);
      this.write(clock + 4, 0x21, m[table + index]);
    }
    this.write(last, 0x20, 0);
    this.write(last + 4, 0x21, 0);
  }

  // $2ab7: the row-13 scroller moves two pixels a frame. A new reversed character
  // from the $1c00 text enters at column 39; a zero byte restarts the text.
  scrollUpper() {
    const m = this.memory;
    m[0x2b4b] = (m[0x2b4b] - 2) & 255;
    if (m[0x2b4b] !== 0xbf) return;
    m[0x2b4b] = 0xc7;
    m.copyWithin(0x0608, 0x0609, 0x0630);
    this.nextCharacter(0x2cd6, 0x1c00, 0x062f);
  }

  // $2c09: the row-19 scroller moves one pixel a frame through the $4000 text.
  scrollLower() {
    const m = this.memory;
    m[0x2c9a] = (m[0x2c9a] - 1) & 255;
    if (m[0x2c9a] !== 0xbf) return;
    m[0x2c9a] = 0xc7;
    m.copyWithin(0x06f8, 0x06f9, 0x0720);
    this.nextCharacter(0x2cd8, 0x4000, 0x071f);
  }

  nextCharacter(pointer, start, target) {
    const m = this.memory;
    let address = m[pointer] | (m[pointer + 1] << 8);
    if (!m[address]) address = start;
    m[target] = (m[address] + 0x80) & 255;
    address = (address + 1) & 0xffff;
    m[pointer] = address & 255;
    m[pointer + 1] = address >> 8;
  }

  // $2958: the two top sprites step through $20-$24 every sixth IRQ, the six
  // stencil sprites through $80-$94 every fifth.
  animateSprites() {
    const m = this.memory;
    if (m[0x29c2] === 5) {
      m[0x29c2] = 0;
      m[0x07f8] = m[0x07f9] = m[0x29c4];
      m[0x29c4]++;
      if (m[0x29c4] === 0x25) m[0x29c4] = 0x20;
    } else m[0x29c2]++;
    if (m[0x29c3] === 4) {
      m[0x29c3] = 0;
      m.fill(m[0x29c5], 0x07fa, 0x0800);
      m[0x29c5]++;
      if (m[0x29c5] === 0x95) m[0x29c5] = 0x80;
    } else m[0x29c3]++;
  }

  // $2cac rotates the lower scroller's bar colours right every fourth frame.
  rotateLowerBars() {
    const m = this.memory;
    if (m[0x2cab] !== 3) {
      m[0x2cab]++;
      return false;
    }
    m[0x2cab] = 0;
    // The original saves $2caa (the table's last entry) and wraps it to the front.
    const last = m[0x2caa];
    m.copyWithin(0x2c9c, 0x2c9b, 0x2caa);
    m[0x2c9b] = last;
    return true;
  }

  // $2b5d rotates the upper scroller's colours left every fourth frame.
  rotateUpperBars() {
    const m = this.memory;
    if (m[0x2b5c] !== 3) {
      m[0x2b5c]++;
      return false;
    }
    m[0x2b5c] = 0;
    const first = m[0x2b4c];
    m.copyWithin(0x2b4c, 0x2b4d, 0x2b5d);
    m[0x2b5b] = first;
    return true;
  }

  // $2e6e copies the upper scroller's first colour into row 9 every fourth frame.
  // Colours of 8 and above switch that row into multicolour under $d016 = $f8.
  cycleRow9() {
    const m = this.memory;
    if (m[0x2e6d] !== 3) {
      m[0x2e6d]++;
      return;
    }
    m[0x2e6d] = 0;
    this.colorRam.fill(m[0x2b4c] & 15, 360, 400);
  }

  requestExit() {
    this.exitRequested = true;
  }

  step() {
    this.frame++;
    this.vic.set(this.vicEnd);
    this.events = [];
    // $2dd4, the end of the previous frame's last IRQ: music, lower scroller, row 9,
    // then the SPACE test that leaves for $1a00.
    if (this.frame > 1) {
      this.scrollLower();
      this.cycleRow9();
      if (this.exitRequested) {
        this.exited = true;
        return;
      }
    }
    this.runMainLoop();
    const m = this.memory;

    // $2904 at line 50: grey bars, scroller 1, sprite frames.
    this.bars(0x2950, 8, at(51, 1), at(51, 63), 66, at(60, 1));
    this.scrollUpper();
    this.animateSprites();

    // $29ea at line 106: blue-white bars, then the $3000 character set.
    this.bars(0x2a3d, 8, at(107, 1), at(107, 63), 66, at(116, 1));
    this.write(at(116, 17), 0x18, 0x1c);

    // $2a69 at line 154: row 13 in 38 columns with colour bars behind its holes.
    this.write(at(154, 61), 0x16, m[0x2b4b]);
    this.bars(0x2b4c, 8, at(155, 4), at(156, 11), 64, at(163, 0));
    this.write(at(163, 10), 0x16, 0xc8);
    this.write(at(163, 59), 0x26, 0x00);
    this.write(at(164, 0), 0x25, 0x0a);

    // $2bab at line 202: row 19 scroller, colour rotation, $3800 character set.
    this.write(at(202, 63), 0x16, m[0x2c9a]);
    this.bars(0x2c9b, 8, at(203, 6), at(204, 10), 64, at(211, 2));
    this.write(at(211, 12), 0x16, 0xc8);
    // Both counters run in step; a frame that rotates the tables writes 575 cycles later.
    const lower = this.rotateLowerBars(), upper = this.rotateUpperBars();
    const delay = lower || upper ? at(9, -10) : 0;
    this.write(at(212, 47) + delay, 0x25, 0x06);
    this.write(at(212, 59) + delay, 0x18, 0x1e);
    this.write(at(213, 0) + delay, 0x26, 0x01);
    this.write(at(213, 17) + delay, 0x18, 0x1e);
    this.write(at(213, 35) + delay, 0x16, 0xc8);

    // $2d0e at line 226 and $2d80 at line 242: the green lines around row 23.
    this.bars(0x2d53, 9, at(227, 0), at(228, 12), 64, at(236, 64));
    this.write(at(237, 9), 0x16, 0xc8);
    this.bars(0x2dc7, 10, at(243, 1), at(244, 6), 64, at(253, 15));
    this.write(at(253, 25), 0x16, 0xf8);
    this.write(at(273, 20), 0x16, 0xf8);
    this.write(at(273, 54), 0x18, 0x1e);

    this.events.sort((a, b) => a[0] - b[0]);
    this.vicEnd.set(this.vic);
    for (const [, register, value] of this.events) this.vicEnd[register] = value;
  }
}
