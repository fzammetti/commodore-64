import { CYCLES_PER_FRAME, CYCLES_PER_LINE, RASTER_LINES, FIRST_VISIBLE_LINE } from './timing.js';
import { exitSchedule, applyWrite } from './exit-model.js';

const RAM = 0x10000;

// The first frame still shows the setup: VICE traced it selecting the character set and
// then the screen at $2800 in line 94. Above that the KERNAL's cleared screen at $0400.
const SETUP_WRITES = [[94 * CYCLES_PER_LINE + 23, 0x18, 0x18], [94 * CYCLES_PER_LINE + 35, 0x18, 0xa8]];

// $d011 is $1b (Y scroll 3), so lines 51, 59 … 243 are badlines. From cycle 12 of a
// badline the VIC-II holds the CPU at its next read until cycle 55; writes go on.
const FIRST_BADLINE = 51, LAST_BADLINE = 243, Y_SCROLL = 3;
const STALL_FROM = 12, STALL_TO = 55;

// Bus patterns of the instructions the IRQ runs, one letter per cycle.
const IMPLIED = 'rr', IMMEDIATE = 'rr', ZP_READ = 'rrr', ZP_WRITE = 'rrw', ZP_RMW = 'rrrww';
const ABS_READ = 'rrrr', ABS_READ_CROSS = 'rrrrr', ABS_WRITE = 'rrrw', ABS_INDEXED_WRITE = 'rrrrw';
const ABS_RMW = 'rrrrww', ABS_INDEXED_RMW = 'rrrrrww', INDIRECT_Y = 'rrrrr';
const JSR = 'rrrwwr', RTS = 'rrrrrr', JMP = 'rrr', BRANCH = 'rr', BRANCH_TAKEN = 'rrr';

// Translation of the intro Fantasy wrote for Lethal's crack of New Barbarian II. The
// decruncher calls $1800, which clears the screen, selects the screen at $2800 and the
// character set at $2000, initialises the music ($1000) and the IRQ ($0800), and then
// idles in a 9-cycle loop at $1833 that reads the keyboard but never branches. The one
// raster IRQ, at line 146 through the KERNAL's $0314 vector, does all the work: the
// bars and the scroller on row 12, the colour cycling, the starfield, the music and the
// SPACE test. Its entry cycle (38 to 41) depends on where the idle loop was.
export class IntroModel {
  // The assets: RAM and I/O as the setup left them, the IRQ's traced write cycles and
  // entry cycles, the music's cycle counts and loop, and the exit's traced writes.
  constructor({ ram, io, timing, entries, playCycles, musicLoop, exitTiming }) {
    this.memory = new Uint8Array(ram).slice();
    if (this.memory.length !== 65536) throw new Error('IntroModel requires 64 KiB of RAM.');
    this.colorRam = new Uint8Array(io.subarray(0x800, 0xc00)).map(value => value & 15);
    this.vic = new Uint8Array(64);
    this.vic.set(io.subarray(0, 47));
    this.timing = timing;
    this.entries = entries;
    this.playCycles = playCycles;
    this.musicLoop = musicLoop;
    this.exitTiming = exitTiming;
    this.frame = 0;
    this.base = 0;
    this.clock = 0;
    this.events = [];
    this.marks = null;
    this.exitRequested = false;
    this.exited = false;
    this.exitClock = 0;
    this.exitWrites = [];
    this.exitNext = 0;
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

  poke(clock, address, value) {
    this.memory[address] = value;
    this.events.push([clock - this.base, RAM + address, value]);
  }

  // Optional record of instruction start clocks, compared with VICE traces.
  mark(address) {
    if (this.marks) this.marks.push([address, this.clock - this.base]);
  }

  // ---- CPU timing ----

  // Runs one instruction's bus cycles from the clock and returns the clock of its last
  // cycle, which is when a store or read-modify-write lands.
  run(pattern) {
    for (let index = 0; index < pattern.length; index++) {
      if (pattern[index] === 'r') {
        const local = this.clock - this.base;
        const line = Math.floor(local / CYCLES_PER_LINE) % RASTER_LINES, cycle = local % CYCLES_PER_LINE;
        if (line >= FIRST_BADLINE && line <= LAST_BADLINE && (line & 7) === Y_SCROLL
          && cycle >= STALL_FROM && cycle < STALL_TO) this.clock += STALL_TO - cycle;
      }
      this.clock++;
    }
    return this.clock - 1;
  }

  // The idle loop's position when the IRQ arrives follows every cycle the handler and
  // the music spend. VICE traced it for the first 40,641 frames (about 11 minutes); the
  // sequence then repeats.
  entry(frame) {
    const { entries, first } = this.entries;
    return first + +entries[frame % entries.length];
  }

  // ---- the IRQ at line 146 ----

  // $0827: row 12's fine scroll from $08e0 (38 columns), then eight lines of border and
  // background colour, from $08fb and $08e3. Each line of the loop takes 65 cycles, 66
  // once $08fb,y crosses into page 9, so the colours change mid-line at the cycles VICE
  // traced. The scroller's letters are reversed characters in black, so the background
  // bars show through them and the border bars run out to the screen edges. Then black
  // and 40 columns.
  bars() {
    const m = this.memory, values = [m[0x08e0], m[0x08fb], m[0x08e3]];
    for (let y = 1; y < 8; y++) values.push(m[0x08fb + y], m[0x08e3 + y]);
    values.push(0, 0, 0xc8);
    const { registers, clocks } = this.timing;
    const times = clocks[this.entry(this.frame)];
    for (let index = 0; index < registers.length; index++) {
      this.write(this.base + times[index], registers[index], values[index]);
    }
    this.clock = this.base + times[times.length - 1] + 1;
  }

  // $0885: the scroller moves one pixel a frame. Every eighth frame row 12 shifts left
  // and the next character of the text at $1a00 (pointer $b0) enters on the right; at the
  // closing zero the pointer goes back to $1a00 and the reversed space from row 13
  // enters instead.
  scroll() {
    const m = this.memory;
    this.run(JSR);
    this.run(ABS_RMW);
    m[0x08e0] = (m[0x08e0] - 1) & 255;
    this.run(ABS_READ);
    this.run(IMMEDIATE);
    if (m[0x08e0] !== 0xbf) {
      this.run(BRANCH);
      this.run(RTS);
      return;
    }
    this.run(BRANCH_TAKEN);
    this.run(IMMEDIATE);
    this.run(ABS_WRITE);
    m[0x08e0] = 0xc7;
    this.run(IMMEDIATE);
    for (let x = 0; x < 40; x++) {
      this.run(0x29e1 + x >= 0x2a00 ? ABS_READ_CROSS : ABS_READ);
      this.poke(this.run(ABS_INDEXED_WRITE), 0x29e0 + x, m[0x29e1 + x]);
      this.run(IMPLIED);
      this.run(IMMEDIATE);
      this.run(x < 39 ? BRANCH_TAKEN : BRANCH);
    }
    this.run(IMMEDIATE);
    const pointer = m[0xb0] | (m[0xb1] << 8), character = m[pointer];
    this.run(INDIRECT_Y);
    this.run(IMMEDIATE);
    if (!character) {
      this.run(BRANCH_TAKEN);
      this.run(IMMEDIATE);
      this.run(IMMEDIATE);
      this.run(ZP_WRITE);
      this.run(ZP_WRITE);
      m[0xb0] = 0x00;
      m[0xb1] = 0x1a;
      this.run(RTS);
      return;
    }
    this.run(BRANCH);
    this.poke(this.run(ABS_WRITE), 0x2a07, character);
    this.run(ZP_RMW);
    m[0xb0] = (m[0xb0] + 1) & 255;
    this.run(ZP_READ);
    this.run(IMMEDIATE);
    if (m[0xb0]) this.run(BRANCH_TAKEN);
    else {
      this.run(BRANCH);
      this.run(ZP_RMW);
      m[0xb1] = (m[0xb1] + 1) & 255;
    }
    this.run(RTS);
  }

  // $0903: every fourth frame the 24 background colours at $08e3 rotate left. The first
  // eight are the bars.
  rotateBackground() {
    const m = this.memory;
    this.run(JSR);
    this.run(ABS_READ);
    this.run(IMMEDIATE);
    if (m[0x08e2] !== 3) {
      this.run(BRANCH);
      this.run(ABS_RMW);
      m[0x08e2]++;
      this.run(RTS);
      return;
    }
    this.run(BRANCH_TAKEN);
    this.run(IMMEDIATE);
    this.run(ABS_WRITE);
    m[0x08e2] = 0;
    this.run(ABS_READ);
    this.run(ABS_WRITE);
    m[0x08e1] = m[0x08e3];
    this.run(IMMEDIATE);
    for (let y = 0; y < 24; y++) {
      this.run(ABS_READ);
      this.run(ABS_INDEXED_WRITE);
      m[0x08e3 + y] = m[0x08e4 + y];
      this.run(IMPLIED);
      this.run(IMMEDIATE);
      this.run(y < 23 ? BRANCH_TAKEN : BRANCH);
    }
    this.run(ABS_READ);
    this.run(ABS_WRITE);
    m[0x08fa] = m[0x08e1];
    this.run(RTS);
  }

  // $0930: every third frame the eight border colours at $08fb (two white, six black)
  // rotate, so the white line steps down through the bars; after six steps $092d turns
  // it round.
  rotateBorder() {
    const m = this.memory;
    this.run(JSR);
    this.run(ABS_READ);
    this.run(IMMEDIATE);
    if (m[0x092f] !== 2) {
      this.run(BRANCH);
      this.run(ABS_RMW);
      m[0x092f]++;
      this.run(RTS);
      return;
    }
    this.run(BRANCH_TAKEN);
    this.run(IMMEDIATE);
    this.run(ABS_WRITE);
    m[0x092f] = 0;
    this.run(ABS_READ);
    this.run(IMMEDIATE);
    if (m[0x092d] === 0) {
      // $0951: rotate right.
      this.run(BRANCH_TAKEN);
      this.run(JMP);
      this.run(ABS_READ);
      this.run(ABS_WRITE);
      m[0x08e1] = m[0x0902];
      this.run(IMMEDIATE);
      for (let y = 6; y >= 0; y--) {
        this.run(0x08fb + y >= 0x0900 ? ABS_READ_CROSS : ABS_READ);
        this.run(ABS_INDEXED_WRITE);
        m[0x08fc + y] = m[0x08fb + y];
        this.run(IMPLIED);
        this.run(IMMEDIATE);
        this.run(y > 0 ? BRANCH_TAKEN : BRANCH);
      }
      this.run(ABS_READ);
      this.run(ABS_WRITE);
      m[0x08fb] = m[0x08e1];
      this.run(JMP);
    } else {
      // $096d: rotate left. The loop copies one byte too many ($0903, code), which the
      // saved first colour then overwrites.
      this.run(BRANCH);
      this.run(IMMEDIATE);
      this.run(m[0x092d] === 1 ? BRANCH_TAKEN : BRANCH);
      this.run(JMP);
      this.run(ABS_READ);
      this.run(ABS_WRITE);
      m[0x08e1] = m[0x08fb];
      this.run(IMMEDIATE);
      for (let y = 0; y < 8; y++) {
        this.run(0x08fc + y >= 0x0900 ? ABS_READ_CROSS : ABS_READ);
        this.run(ABS_INDEXED_WRITE);
        m[0x08fb + y] = m[0x08fc + y];
        this.run(IMPLIED);
        this.run(IMMEDIATE);
        this.run(y < 7 ? BRANCH_TAKEN : BRANCH);
      }
      this.run(ABS_READ);
      this.run(ABS_WRITE);
      m[0x0902] = m[0x08e1];
    }
    // $0986
    this.run(ABS_RMW);
    m[0x092e]++;
    this.run(ABS_READ);
    this.run(IMMEDIATE);
    if (m[0x092e] !== 6) {
      this.run(BRANCH);
      this.run(RTS);
      return;
    }
    this.run(BRANCH_TAKEN);
    this.run(IMMEDIATE);
    this.run(ABS_WRITE);
    m[0x092e] = 0;
    this.run(ABS_READ);
    this.run(IMMEDIATE);
    this.run(m[0x092d] ? BRANCH : BRANCH_TAKEN);
    this.run(IMMEDIATE);
    this.run(ABS_WRITE);
    m[0x092d] = m[0x092d] ? 0 : 1;
    this.run(RTS);
  }

  // $0c2f jumps to $0cd3 (the routine before it is never used). The stars are the
  // characters "A" to "Z" repeated over the screen. Each of the eight pixel rows of
  // their 26 glyphs forms a 208-pixel ring, which ROL moves left 3, 4, 2, 0, 5, 1, 7 and
  // 6 pixels a frame (speeds at $0d48), one pixel per pass from "Z" back to "A". This
  // runs while the lower half of the screen is drawn, so each store lands at its own
  // cycle, and rows there can show a ring part way through a pass.
  stars() {
    const m = this.memory;
    this.run(JSR);
    this.run(JMP);
    this.mark(0x0cd3);
    this.run(IMMEDIATE);
    for (let row = 0; row < 8; row++) {
      this.run(ABS_READ);
      this.run(IMMEDIATE);
      const passes = m[0x0d48 + row];
      if (!passes) {
        this.run(BRANCH);
        this.run(JMP);
      } else {
        this.run(BRANCH_TAKEN);
        for (let pass = 0; pass < passes; pass++) {
          this.mark(0x0cdf);
          this.run(IMPLIED);
          let carry = 0;
          for (let code = 0x5a; code >= 0x41; code--) {
            const address = 0x2000 + code * 8 + row, value = m[address];
            this.poke(this.run(ABS_INDEXED_RMW), address, ((value << 1) | carry) & 255);
            carry = value >> 7;
          }
          if (carry) {
            this.run(BRANCH);
            this.run(ABS_READ);
            this.run(IMMEDIATE);
            this.poke(this.run(ABS_INDEXED_WRITE), 0x22d0 + row, m[0x22d0 + row] | 1);
          } else this.run(BRANCH_TAKEN);
          this.run(IMPLIED);
          if (pass < passes - 1) {
            this.run(BRANCH);
            this.run(JMP);
          } else this.run(BRANCH_TAKEN);
        }
      }
      this.mark(0x0d3e);
      this.run(IMPLIED);
      this.run(IMMEDIATE);
      if (row < 7) {
        this.run(BRANCH);
        this.run(JMP);
      } else this.run(BRANCH_TAKEN);
    }
    this.run(RTS);
  }

  // $0877: JSR $1006 plays the music (captured separately as SID writes); VICE's cycle
  // counts for each call are in the play-cycles asset. $09a9 then tests SPACE alone
  // (row 4 of $dc01 reading $ef) and jumps to $1900.
  music() {
    this.run(JSR);
    this.mark(0x1006);
    const cycles = this.playCycles, { length } = cycles, loopStart = this.musicLoop;
    const index = this.frame < length ? this.frame : loopStart + (this.frame - loopStart) % (length - loopStart);
    this.clock += cycles[index] + 6;
    this.mark(0x09a9);
    if (this.exitRequested) {
      this.exited = true;
      // LDA, CMP and the taken BEQ take 9 cycles. The traced exit clocks count from
      // VICE's report of $09a9, which comes a cycle before this model's start clock.
      this.leave(this.clock - 1 + 9 - this.base);
    }
  }

  // $09b1 jumps to $1900. The writes that land before this frame's picture ends are
  // part of it; the exit model replays the rest.
  leave(clock) {
    this.exitClock = clock;
    this.exitWrites = exitSchedule(this.exitTiming, clock);
    const end = CYCLES_PER_FRAME + FIRST_VISIBLE_LINE * CYCLES_PER_LINE;
    while (this.exitNext < this.exitWrites.length && this.exitWrites[this.exitNext][0] < end) {
      const write = this.exitWrites[this.exitNext++];
      applyWrite(this, write);
      this.events.push(write);
    }
  }

  // ---- frame ----

  // A frame covers raster line 28 to line 27 of the next frame. The IRQ starts at line
  // 146 and, on frames where the scroller shifts, runs on into the next frame's top
  // border.
  step() {
    this.base = this.frame * CYCLES_PER_FRAME;
    this.events = [];
    this.view.memory.set(this.memory);
    this.view.colorRam.set(this.colorRam);
    this.view.vic.set(this.vic);
    if (this.frame === 0) {
      this.view.vic[0x18] = 0x14;
      this.events.push(...SETUP_WRITES);
    }
    this.bars();
    this.scroll();
    this.rotateBackground();
    this.rotateBorder();
    this.stars();
    this.music();
    this.view.events = this.events.sort((a, b) => a[0] - b[0]);
    this.frame++;
  }
}
