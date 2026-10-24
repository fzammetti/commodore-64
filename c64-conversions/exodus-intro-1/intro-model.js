import { CYCLES_PER_LINE, CYCLES_PER_FRAME, RASTER_LINES, FIRST_VISIBLE_LINE } from './timing.js';

const at = (line, cycle) => line * CYCLES_PER_LINE + cycle;

// Each model frame covers what the display shows: raster line 28 to line 27 of the
// next frame.
const WINDOW = at(FIRST_VISIBLE_LINE, 0);

// Badlines halt the CPU for 43 cycles. Measured: the $2a97 and $2919 work runs 3,226
// CPU cycles over seven badlines and takes 3,527 cycles in VICE.
const STALL_FROM = 12, STALL_TO = 55;
const isBadline = line => line >= 48 && line < 248 && (line & 7) === 3;

// Wall clock after `cycles` CPU cycles that start at `clock`.
function finish(clock, cycles) {
  while (cycles > 0) {
    const line = Math.floor(clock / CYCLES_PER_LINE), cycle = clock - line * CYCLES_PER_LINE;
    let run = CYCLES_PER_LINE - cycle;
    if (isBadline(line % RASTER_LINES)) {
      if (cycle >= STALL_FROM && cycle < STALL_TO) {
        clock += STALL_TO - cycle;
        continue;
      }
      if (cycle < STALL_FROM) run = STALL_FROM - cycle;
    }
    const step = Math.min(run, cycles);
    clock += step;
    cycles -= step;
  }
  return clock;
}

// The four raster IRQs, all entered through the KERNAL's $0314 vector.
const IRQS = [
  { line: 0x34, handler: '2833' },
  { line: 0x72, handler: '2983' },
  { line: 0x9a, handler: '2a28' },
  { line: 0xe1, handler: '2b50' }
];

// The handler starts 38 cycles into the line when the main loop's instruction ends as
// the IRQ arrives; a longer instruction delays it, up to the 7-cycle ROL.
const ENTRY = 38;

// CPU cycles from each IRQ's last colour write to its next-IRQ setup (counted in the
// recovered code); 26 more cycles store $d012 and leave through $ea81.
const LOGO_TAIL = 45;
const BARS_TAIL = 57, BARS_ROTATE_TAIL = 362;
const TEXT_TAIL = 97, TEXT_CYCLE_TAIL = 3226;
const EXIT_CYCLES = 26;
// The fourth IRQ: scroller and SPACE test before the music, then the IRQ1 setup.
const SCROLL = 87, SCROLL_FAST = 5, PAUSED = 76, PAUSE_END = 19, NEW_CHARACTER = 688;
const COLOR_CYCLE = 1127, PLAY_CALL = 6, AFTER_PLAY = 36;

const RAM = 0x10000, COLOR = 0x20000;

// Translation of Exodus' "Intro #1" (intro by Fantasy): the $0a00 setup, the
// $2833 → $2983 → $2a28 → $2b50 raster IRQ chain, and the $0a47 main loop that rolls
// the starfield glyphs and fades "INTRO BY FANTASY!".
export class IntroModel {
  constructor(ram, io, timing, playCycles, music) {
    this.memory = new Uint8Array(ram).slice();
    if (this.memory.length !== 65536) throw new Error('IntroModel requires 64 KiB of RAM.');
    this.colorRam = new Uint8Array(io.subarray(0x800, 0xc00)).map(value => value & 15);
    this.vic = new Uint8Array(64);
    this.vic.set(io.subarray(0, 47));
    this.timing = timing;
    this.playCycles = playCycles;
    this.music = music;
    this.plays = 0;
    this.frame = 0;
    this.base = 0;
    this.events = [];
    this.exitRequested = false;
    this.exited = false;
    // Setup reaches the main loop at line 34, cycle 63 (VICE, NTSC).
    this.clock = at(34, 63);
    this.main = this.mainLoop();
    this.pending = this.main.next().value;
    this.irq = 0;
    this.irqFrame = 0;
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

  // ---- main loop at $0a47: one yield per instruction, with its cycle count ----

  *mainLoop() {
    for (;;) {
      yield 6;                                        // JSR $0c2f
      yield 3;                                        // JMP $0cd3
      yield* this.rollStars();
      yield* this.delay();
      yield 6;                                        // JSR $0a61
      yield* this.cycleCenterText();
      yield 3;                                        // JMP $0a47
    }
  }

  // $0cd3: glyph rows 0-7 of characters $41-$5a ($3a08) form one 208-pixel loop per
  // row, rotated left $0d48[row] pixels each pass. The screen repeats them as stars.
  *rollStars() {
    const m = this.memory;
    yield 2;                                          // LDX #0
    for (let row = 0; row < 8; row++) {
      yield 4;                                        // LDY $0d48,X
      yield 2;                                        // CPY #0
      let count = m[0x0d48 + row];
      if (!count) {
        yield 2;                                      // BNE
        yield 3;                                      // JMP $0d3e
      } else {
        yield 3;                                      // BNE $0cdf
        for (;;) {
          yield 2;                                    // CLC
          let carry = 0;
          for (let column = 25; column >= 0; column--) {
            yield 7;                                  // ROL $3a08+8*column,X
            const address = 0x3a08 + column * 8 + row, value = m[address];
            this.poke(address, ((value << 1) | carry) & 255);
            carry = value >> 7;
          }
          if (carry) {
            yield 2;                                  // BCC
            yield 4;                                  // LDA $3ad0,X
            yield 2;                                  // ORA #1
            yield 5;                                  // STA $3ad0,X
            this.poke(0x3ad0 + row, m[0x3ad0 + row] | 1);
          } else yield 3;                             // BCC $0d38
          yield 2;                                    // DEY
          if (!--count) {
            yield 3;                                  // BEQ $0d3e
            break;
          }
          yield 2;                                    // BEQ
          yield 3;                                    // JMP $0cdf
        }
      }
      yield 2;                                        // INX
      yield 2;                                        // CPX #8
      if (row < 7) {
        yield 2;                                      // BEQ
        yield 3;                                      // JMP $0cd5
      } else yield 3;                                 // BEQ $0d46
    }
    yield 6;                                          // RTS
  }

  // $0a4a: three passes of a 208-step DEX loop.
  *delay() {
    yield 2;                                          // LDY #2
    for (let y = 2; ; y--) {
      yield 2;                                        // LDX #$d0
      for (let x = 0xcf; x >= 0; x--) {
        yield 2;                                      // DEX
        yield 2;                                      // CPX #0
        yield x ? 3 : 2;                              // BNE $0a4e
      }
      yield 2;                                        // CPY #0
      if (!y) {
        yield 3;                                      // BEQ $0a5b
        return;
      }
      yield 2;                                        // BEQ
      yield 2;                                        // DEY
      yield 3;                                        // JMP $0a4c
    }
  }

  // $0a61: colours "INTRO BY" and "FANTASY!" (rows 17 and 19, columns 16-23) with the
  // first entry of the 15-step fade at $0a8d, then rotates the fade.
  *cycleCenterText() {
    const m = this.memory;
    yield 2;                                          // NOP
    yield 4;                                          // LDA $0a8d
    yield 2;                                          // LDX #0
    const color = m[0x0a8d];
    for (let x = 0; x < 8; x++) {
      yield 5;                                        // STA $dab8,X
      this.pokeColor(696 + x, color);
      yield 5;                                        // STA $db08,X
      this.pokeColor(776 + x, color);
      yield 2;                                        // INX
      yield 2;                                        // CPX #8
      yield x < 7 ? 3 : 2;                            // BNE $0a67
    }
    yield 4;                                          // LDA $0a8d
    yield 4;                                          // STA $0a8c
    yield 2;                                          // LDY #0
    for (let y = 0; y < 15; y++) {
      yield 4;                                        // LDA $0a8e,Y
      yield 5;                                        // STA $0a8d,Y
      yield 2;                                        // INY
      yield 2;                                        // CPY #$0f
      yield y < 14 ? 3 : 2;                           // BNE $0a7a
    }
    m[0x0a8c] = m[0x0a8d];
    m.copyWithin(0x0a8d, 0x0a8e, 0x0a9c);
    m[0x0a9b] = m[0x0a8c];
    yield 4;                                          // LDA $0a8c
    yield 4;                                          // STA $0a9b
    yield 6;                                          // RTS
  }

  runMain(limit) {
    while (this.clock < limit) {
      this.clock = finish(this.clock, this.pending);
      this.pending = this.main.next().value;
    }
  }

  // ---- raster IRQs ----

  // Writes the handler's colour and register values at the cycles VICE traced for
  // this entry cycle, then returns the clock of the last write.
  replay(handler, entry, frameBase, values) {
    const { registers, clocks } = this.timing[handler];
    const times = clocks[entry];
    for (let index = 0; index < registers.length; index++) {
      const value = typeof values[index] === 'function' ? values[index]() : values[index];
      this.write(frameBase + times[index], registers[index], value);
    }
    return frameBase + times[times.length - 1];
  }

  // $2833 at line 52: 48 lines of logo colours ($d022 from $28b9, $d023 from $28e9) in
  // multicolour with the $2000 character set, then black and the $3800 set.
  logo(entry, frameBase) {
    const m = this.memory, vic = this.vic, values = [];
    for (let y = 0; y < 48; y++) {
      values.push(m[0x28b9 + y], m[0x28e9 + y], () => vic[0x16] | 0x10, () => (vic[0x18] & 0xf0) | 0x08);
    }
    values.push(0, 0, 0, 0, () => vic[0x16] & 0xef, () => (vic[0x18] & 0xf0) | 0x0e);
    return finish(this.replay('2833', entry, frameBase, values), LOGO_TAIL + EXIT_CYCLES);
  }

  // Ten lines of border and background colour from a table, then black.
  bars(handler, table, entry, frameBase) {
    const m = this.memory, values = [];
    for (let y = 0; y < 10; y++) values.push(m[table + y], m[table + y]);
    values.push(0, 0);
    return this.replay(handler, entry, frameBase, values);
  }

  // $2983 at line 114: the upper bars; every third frame $29ea rotates the eight
  // colours of $29e0 left and $2a7d rotates $2a73 right.
  upperBars(entry, frameBase) {
    const m = this.memory;
    const last = this.bars('2983', 0x29e0, entry, frameBase);
    m[0x2982]++;
    if (m[0x2982] !== 3) return finish(last, BARS_TAIL + EXIT_CYCLES);
    m[0x2982] = 0;
    const first = m[0x29e0];
    m.copyWithin(0x29e0, 0x29e1, 0x29e8);
    m[0x29e7] = first;
    const end = m[0x2a7a];
    m.copyWithin(0x2a74, 0x2a73, 0x2a7a);
    m[0x2a73] = end;
    return finish(last, BARS_ROTATE_TAIL + EXIT_CYCLES);
  }

  // $2a28 at line 154: the lower bars, then every fourth frame $2a97 runs the colours of
  // rows 10 and 11 outwards from the middle and $2919 rotates the logo colours. The two
  // counters start together and stay in step.
  lowerBars(entry, frameBase) {
    const m = this.memory;
    const last = this.bars('2a28', 0x2a73, entry, frameBase);
    if (m[0x2b2a] !== 3) {
      m[0x2b2a]++;
      m[0x2832]++;
      return finish(last, TEXT_TAIL + EXIT_CYCLES);
    }
    m[0x2b2a] = 0;
    m[0x2832] = 0;
    // $2a97: left half $2afa rotates left, right half $2b12 rotates right.
    const left = m[0x2afa];
    m.copyWithin(0x2afa, 0x2afb, 0x2b0e);
    m[0x2b0d] = left;
    const right = m[0x2b25];
    m.copyWithin(0x2b13, 0x2b12, 0x2b25);
    m[0x2b12] = right;
    for (let x = 0; x < 20; x++) {
      this.colorRam[400 + x] = this.colorRam[440 + x] = m[0x2afa + x] & 15;
      this.colorRam[420 + x] = this.colorRam[460 + x] = m[0x2b12 + x] & 15;
    }
    // $2919: $d022 colours rotate left, $d023 colours right.
    const first = m[0x28b9];
    m.copyWithin(0x28b9, 0x28ba, 0x28e9);
    m[0x28e8] = first;
    const end = m[0x2918];
    m.copyWithin(0x28ea, 0x28e9, 0x2918);
    m[0x28e9] = end;
    return finish(last, TEXT_CYCLE_TAIL + EXIT_CYCLES);
  }

  // $2b50 at line 225: 24 lines of colour behind the scroller on row 23, whose fine
  // scroll ($2c11) is set on the first line; then the scroller, its colours, the SPACE
  // test and the music.
  scrollerBars(entry, frameBase) {
    const m = this.memory, values = [m[0x2c12], m[0x2c12], m[0x2c11]];
    for (let y = 1; y < 24; y++) values.push(m[0x2c12 + y], m[0x2c12 + y]);
    values.push(0, 0, 0xc8);
    const last = this.replay('2b50', entry, frameBase, values);
    let cycles = this.scroll() + this.cycleScrollColors();
    // $2cda: SPACE leaves through $0b00 before the music plays.
    if (this.exitRequested) {
      this.exited = true;
      return last;
    }
    cycles += PLAY_CALL + this.playCost() + AFTER_PLAY;
    return finish(last, cycles + EXIT_CYCLES);
  }

  // $2b96: a $1f byte pauses the scroller for 128 frames, $1e toggles two pixels a
  // frame, zero restarts the text at $3400. Returns the CPU cycles used.
  scroll() {
    const m = this.memory;
    let cycles = SCROLL;
    if (m[0x2cbb] === 1) {
      m[0x2cbc] = (m[0x2cbc] - 1) & 255;
      if (m[0x2cbc]) return PAUSED;
      m[0x2cbb] = 0;
      cycles += PAUSE_END;
    }
    if (m[0x2cbd]) {
      m[0x2c11]--;
      cycles += SCROLL_FAST;
    }
    m[0x2c11]--;
    if (m[0x2c11] !== 0xbf) return cycles;
    m[0x2c11] = 0xc7;
    m.copyWithin(0x3398, 0x3399, 0x33c1);
    return cycles + NEW_CHARACTER + this.nextCharacter();
  }

  // $2c8a reads the next text byte through the pointer at $b0.
  nextCharacter() {
    const m = this.memory;
    let cycles = 0, pointer = m[0xb0] | (m[0xb1] << 8), byte = m[pointer];
    if (!byte) {
      // $2bda: back to $3400 at one pixel a frame.
      pointer = 0x3400;
      m[0x2cbd] = 0;
      byte = m[pointer];
      cycles += 48;
    }
    if (byte === 0x1f) {
      m[0x2cbb] = 1;
      m[0x2cbc] = 0x80;
      cycles += 3;
    } else if (byte === 0x1e) {
      cycles += m[0x2cbd] === 1 ? 10 : 9;
      m[0x2cbd] = m[0x2cbd] === 1 ? 0 : 1;
    } else m[0x33bf] = byte;
    pointer = (pointer + 1) & 0xffff;
    if (!(pointer & 255)) cycles += 4;
    m[0xb0] = pointer & 255;
    m[0xb1] = pointer >> 8;
    return cycles;
  }

  // $2c2b: every third frame the 40 colours at $2c62 rotate right and the first one
  // colours the whole scroller row.
  cycleScrollColors() {
    const m = this.memory;
    if (m[0x2c2a] !== 2) {
      m[0x2c2a]++;
      return 0;
    }
    m[0x2c2a] = 0;
    const last = m[0x2c89];
    m.copyWithin(0x2c63, 0x2c62, 0x2c89);
    m[0x2c62] = last;
    this.colorRam.fill(last & 15, 920, 960);
    return COLOR_CYCLE;
  }

  // CPU cycles of this frame's $1704 music call, measured for every frame of the tune.
  playCost() {
    const { loopStart, frames } = this.music, index = this.plays++;
    return this.playCycles[index < frames ? index : loopStart + (index - loopStart) % (frames - loopStart)];
  }

  // ---- frame ----

  step() {
    this.base = this.frame * CYCLES_PER_FRAME;
    this.events = [];
    this.view.memory.set(this.memory);
    this.view.colorRam.set(this.colorRam);
    this.view.vic.set(this.vic);
    const end = this.base + CYCLES_PER_FRAME + WINDOW;
    for (;;) {
      const frameBase = this.irqFrame * CYCLES_PER_FRAME;
      const assert = frameBase + at(IRQS[this.irq].line, 0);
      if (assert >= end) {
        this.runMain(end);
        break;
      }
      this.runMain(assert);
      const entry = ENTRY + Math.min(this.clock - assert, 6);
      if (this.irq === 0) this.clock = this.logo(entry, frameBase);
      else if (this.irq === 1) this.clock = this.upperBars(entry, frameBase);
      else if (this.irq === 2) this.clock = this.lowerBars(entry, frameBase);
      else {
        this.clock = this.scrollerBars(entry, frameBase);
        if (this.exited) break;
        this.irqFrame++;
      }
      this.irq = (this.irq + 1) & 3;
    }
    this.view.events = this.events.sort((a, b) => a[0] - b[0]);
    this.frame++;
  }
}
