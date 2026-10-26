import { CYCLES_PER_FRAME, CYCLES_PER_LINE, FIRST_VISIBLE_LINE } from './timing.js';
import { exitThread } from './exit-model.js';
import { MusicPlayer, kernalBus } from './music.js';
import {
  IMPLIED, IMMEDIATE, ZP_READ, ZP_WRITE, ZP_RMW, ABS_READ, ABS_WRITE, ABS_INDEXED_WRITE, ABS_RMW,
  INDIRECT_Y, JSR, RTS, JMP, JMP_INDIRECT, BRANCH, BRANCH_TAKEN, BRANCH_CROSS, PUSH, PULL, RTI,
  INTERRUPT, POLL_EARLY
} from './bus.js';

const RAM = 0x10000, COLOR = 0x20000;

// $d011 is $1b (Y scroll 3), so lines 51, 59 … 243 are badlines. From cycle 12 of a
// badline the VIC-II holds the CPU at its next read until cycle 55; writes go on.
const FIRST_BADLINE = 51, LAST_BADLINE = 243, Y_SCROLL = 3;
const STALL_FROM = 12, STALL_TO = 55;

// Clock 0 is line 0, cycle 0 of frame 0. The main loop starts in line 10, cycle 32;
// the raster compare register still holds line 55, where the first IRQ, $1c2d, comes.
const MAIN_START = 10 * 65 + 32, FIRST_IRQ_LINE = 55;

// The three raster IRQs, by the line their compare value selects.
const BARS_LINE = 0x3a, SCROLL_LINE = 0xda, BORDER_LINE = 0xea;

// Translation of the intro Fantasy wrote for NewAge's release of Genius. The decruncher
// calls $1c00, which blacks out colour RAM rows 1 to 7 (the logo), points the scroll text
// at $1800, initialises the music ($0810) and the raster IRQ ($0f00), and then runs the
// main loop at $1e20 for good. That loop waits in a delay loop and then rotates the
// colours of the text rows; it is not tied to the frame, so the raster IRQs break into
// it wherever it happens to be. Three IRQs, through the KERNAL's $0314 vector, follow
// each other:
//
// - line 58, $1cc9: forty raster bars over the logo, each setting the background, the
//   border and the fine X scroll, then every other frame rotating their tables, then
//   the music and the KERNAL's own IRQ (keyboard scan) at $08cf.
// - line 218, $1c2d: the scroll text's fine scroll; every fourth frame row 21 moves
//   left a character.
// - line 234, $1c5f: restores 40 columns without scroll.
//
// Everything runs on a modelled bus: each instruction's cycles, the badlines' stalls and
// the IRQ's polling, so the bars and the colour cycling's stores land on the cycles
// they do in VICE. The music player and the KERNAL's IRQ handler are timed the same way.
export class IntroModel {
  // The assets: RAM and I/O as they stood when the main loop began (VICE).
  constructor({ ram, io }) {
    this.memory = new Uint8Array(ram).slice();
    if (this.memory.length !== 65536) throw new Error('IntroModel requires 64 KiB of RAM.');
    this.colorRam = new Uint8Array(io.subarray(0x800, 0xc00)).map(value => value & 15);
    this.vic = new Uint8Array(64);
    this.vic.set(io.subarray(0, 47));
    this.vic[0x18] &= 0xfe;
    this.player = new MusicPlayer(this.memory);
    this.clock = MAIN_START;
    this.poll = 0;
    this.handler = 0x1c2d;
    this.irqClock = this.irqAt(0, FIRST_IRQ_LINE);
    this.frame = 0;
    this.pending = [];
    this.marks = null;
    this.keyPressed = false;
    // For verification: leave at this round's key test, as VICE does when the test is
    // patched.
    this.exitRound = 0;
    this.rounds = 0;
    // The exit: when the main loop left, when IOINIT silenced the SID, when the game
    // would start, and whether the C64 hung on the way.
    this.exitClock = -1;
    this.silenceClock = Infinity;
    this.gameClock = Infinity;
    this.hung = false;
    this.done = false;
    this.rasterOff = false;
    // When the bars IRQ last read CIA 1's interrupt flags.
    this.icrRead = 0;
    this.main = this.mainLoop();
    this.shown = {
      memory: this.memory.slice(), colorRam: this.colorRam.slice(), vic: this.vic.slice()
    };
    this.view = {
      memory: this.memory.slice(), colorRam: this.colorRam.slice(), vic: this.vic.slice(), events: []
    };
  }

  // The KERNAL's keyboard scan, in the bars IRQ, puts a key into the buffer at $c6; the
  // main loop looks there once a round.
  pressKey() {
    this.keyPressed = true;
  }

  get exited() {
    return this.exitClock >= 0;
  }

  // ---- events for the display ----

  write(clock, register, value) {
    this.vic[register] = value & 255;
    this.pending.push([clock, register, value & 255]);
  }

  poke(clock, address, value) {
    this.memory[address] = value;
    if (address >= 0x0400 && address < 0x0800) this.pending.push([clock, RAM + address, value]);
  }

  color(clock, address, value) {
    this.colorRam[address - 0xd800] = value & 15;
    this.pending.push([clock, COLOR + address - 0xd800, value & 15]);
  }

  // Optional record of instruction start clocks, compared with VICE traces.
  mark(address) {
    if (this.marks) this.marks.push([address, this.clock]);
  }

  // ---- CPU timing ----

  // Runs one instruction's bus cycles and returns the clock of its last cycle, which is
  // when a store lands. Records the cycle in which the IRQ line is polled.
  run(pattern, poll = pattern.length - 2) {
    for (let index = 0; index < pattern.length; index++) {
      if (pattern[index] === 'r') {
        const local = this.clock % CYCLES_PER_FRAME;
        const line = Math.floor(local / CYCLES_PER_LINE), cycle = local % CYCLES_PER_LINE;
        if (line >= FIRST_BADLINE && line <= LAST_BADLINE && (line & 7) === Y_SCROLL
          && cycle >= STALL_FROM && cycle < STALL_TO) this.clock += STALL_TO - cycle;
      }
      if (index === poll) this.poll = this.clock;
      this.clock++;
    }
    return this.clock - 1;
  }

  irqAt(frame, line) {
    return frame * CYCLES_PER_FRAME + line * CYCLES_PER_LINE + IRQ_DELAY;
  }

  // The main loop's instructions call this; between them the IRQ breaks in.
  * op(pattern, poll) {
    const end = this.run(pattern, poll);
    if (this.poll >= this.irqClock) this.interrupt();
    yield;
    return end;
  }

  interrupt() {
    this.run(INTERRUPT);
    // $ff48: save A, X and Y, test the break flag, JMP ($0314).
    this.run(PUSH); this.run(IMPLIED); this.run(PUSH); this.run(IMPLIED); this.run(PUSH);
    this.run(IMPLIED); this.run(ABS_READ); this.run(IMMEDIATE); this.run(BRANCH_TAKEN);
    this.run(JMP_INDIRECT);
    const handler = this.handler;
    if (handler === 0x1cc9) this.barsIrq();
    else if (handler === 0x1c2d) this.scrollIrq();
    else this.borderIrq();
    // $ea81: restore Y, X and A, RTI.
    this.mark(0xea81);
    this.run(PULL); this.run(IMPLIED); this.run(PULL); this.run(IMPLIED); this.run(PULL);
    this.run(RTI);
  }

  // Sets the next IRQ: its line and the handler $0314 points at.
  next(line, handler) {
    const frame = Math.floor(this.clock / CYCLES_PER_FRAME);
    const local = this.clock - frame * CYCLES_PER_FRAME;
    this.handler = handler;
    this.irqClock = this.irqAt(local < line * CYCLES_PER_LINE ? frame : frame + 1, line);
  }

  // ---- the main loop at $1e20 ----

  * mainLoop() {
    const m = this.memory;
    for (;;) {
      this.mark(0x1e20);
      // $1e20: a delay of eight rounds of 255 DEX.
      yield* this.op(IMMEDIATE);
      for (let y = 7; y >= 0; y--) {
        yield* this.op(IMMEDIATE);
        for (let x = 254; x >= 0; x--) {
          yield* this.op(IMPLIED);
          yield* this.op(IMMEDIATE);
          if (x) {
            yield* this.op(BRANCH);
            yield* this.op(JMP);
          } else yield* this.op(BRANCH_TAKEN, POLL_EARLY);
        }
        yield* this.op(IMMEDIATE);
        if (y) {
          yield* this.op(BRANCH);
          yield* this.op(IMPLIED);
          yield* this.op(JMP);
        } else yield* this.op(BRANCH_TAKEN, POLL_EARLY);
      }
      // $1e34: the scroll text's row 21 takes its colours from $1e61 (41 bytes; the last
      // lands on row 22), and they rotate right.
      this.mark(0x1e34);
      yield* this.op(IMMEDIATE);
      for (let x = 0; x <= 40; x++) {
        yield* this.op(ABS_READ);
        this.color(yield* this.op(ABS_INDEXED_WRITE), 0xdb48 + x, m[0x1e61 + x]);
        yield* this.op(IMMEDIATE);
        if (x < 40) {
          yield* this.op(BRANCH);
          yield* this.op(IMPLIED);
          yield* this.op(JMP);
        } else yield* this.op(BRANCH_TAKEN, POLL_EARLY);
      }
      yield* this.rotate(0x1e88, 0x1e60, 0x1e61, 39, -1, 0x1e61);
      yield* this.op(JMP);
      // $1e8b: rows 10 to 18 take theirs from $1ed0, filled from the right, which rotate
      // left.
      this.mark(0x1e8b);
      yield* this.op(IMMEDIATE);
      for (let x = 40; x >= 0; x--) {
        yield* this.op(ABS_READ);
        for (let row = 0; row < 9; row++) {
          this.color(yield* this.op(ABS_INDEXED_WRITE), 0xd990 + row * 40 + x, m[0x1ed0 + x]);
        }
        yield* this.op(IMMEDIATE);
        if (x) {
          yield* this.op(BRANCH);
          yield* this.op(IMPLIED);
          yield* this.op(JMP);
        } else yield* this.op(BRANCH_TAKEN, POLL_EARLY);
      }
      yield* this.rotate(0x1ed0, 0x1ecf, 0x1ed0, 40, 1, 0x1ef7);
      yield* this.op(JMP);
      // $1efa: rows 22 to 24 from $1f2d. Its rotation moves 41 bytes and puts the first
      // back at $1f53.
      this.mark(0x1efa);
      yield* this.op(IMMEDIATE);
      for (let x = 40; x >= 0; x--) {
        yield* this.op(ABS_READ);
        for (let row = 0; row < 3; row++) {
          this.color(yield* this.op(ABS_INDEXED_WRITE), 0xdb70 + row * 40 + x, m[0x1f2d + x]);
        }
        yield* this.op(IMMEDIATE);
        if (x) {
          yield* this.op(BRANCH);
          yield* this.op(IMPLIED);
          yield* this.op(JMP);
        } else yield* this.op(BRANCH_TAKEN, POLL_EARLY);
      }
      yield* this.rotate(0x1f2d, 0x1f2c, 0x1f2d, 41, 1, 0x1f53);
      yield* this.op(JMP);
      // $1f65: a key in the buffer leaves through $1000.
      this.mark(0x1f65);
      const keys = m[0xc6] || ++this.rounds === this.exitRound;
      yield* this.op(ZP_READ);
      yield* this.op(IMMEDIATE);
      if (keys) {
        yield* this.op(BRANCH);
        yield* this.op(JMP);
        this.exitClock = this.clock;
        yield* exitThread(this);
        this.done = true;
        return;
      }
      yield* this.op(BRANCH_TAKEN, POLL_EARLY);
      yield* this.op(JMP);
    }
  }

  // A table rotation: save one byte, move `count` bytes one place (`direction` -1 from
  // the top down to the right, +1 from the bottom up to the left), put the saved byte
  // back. The caller's JMP follows.
  * rotate(saveFrom, save, first, count, direction, restore) {
    const m = this.memory;
    yield* this.op(ABS_READ);
    yield* this.op(ABS_WRITE);
    m[save] = m[saveFrom];
    yield* this.op(IMMEDIATE);
    for (let step = 0; step < count; step++) {
      const index = direction < 0 ? count - 1 - step : step;
      yield* this.op(ABS_READ);
      yield* this.op(ABS_INDEXED_WRITE);
      if (direction < 0) m[first + index + 1] = m[first + index];
      else m[first + index] = m[first + index + 1];
      yield* this.op(IMPLIED);
      yield* this.op(IMMEDIATE);
      yield* this.op(step < count - 1 ? BRANCH_TAKEN : BRANCH, step < count - 1 ? POLL_EARLY : undefined);
    }
    yield* this.op(ABS_READ);
    yield* this.op(ABS_WRITE);
    m[restore] = m[save];
  }

  // ---- the IRQ at line 58, $1cc9 ----

  delay(x) {
    this.run(JSR);
    for (;;) {
      this.run(IMPLIED);
      x = (x - 1) & 255;
      if (x & 0x80) break;
      this.run(BRANCH_TAKEN);
    }
    this.run(BRANCH);
    this.run(RTS);
  }

  barsIrq() {
    const m = this.memory;
    this.mark(0x1cc9);
    this.run(IMMEDIATE); this.run(ABS_WRITE); this.run(IMMEDIATE); this.run(ABS_WRITE);
    // Forty bars: background from $1d60, border from $1d89, fine scroll from $1d39, one
    // every 75 cycles. The first comes without the wait.
    for (let y = 0; y < 40; y++) {
      if (y === 1) this.run(IMMEDIATE);
      this.run(ABS_READ);
      this.write(this.run(ABS_WRITE), 0x21, m[0x1d60 + y]);
      this.run(ABS_READ);
      this.write(this.run(ABS_WRITE), 0x20, m[0x1d89 + y]);
      this.run(ABS_READ);
      this.write(this.run(ABS_WRITE), 0x16, m[0x1d39 + y]);
      this.run(IMMEDIATE);
      this.delay(y ? 5 : 0);
      if (y) {
        this.run(IMPLIED);
        this.run(IMMEDIATE);
        this.run(y < 39 ? BRANCH_CROSS : BRANCH);
      }
    }
    // $1d08: a short wait, then black and 40 columns.
    this.run(IMMEDIATE);
    this.delay(0);
    this.run(IMMEDIATE);
    this.write(this.run(ABS_WRITE), 0x21, 0);
    this.write(this.run(ABS_WRITE), 0x20, 0);
    this.run(IMMEDIATE);
    this.write(this.run(ABS_WRITE), 0x16, 0xc8);
    // $1d1a: a frame counter. When it reaches 3 the program changes the STA $D01A at
    // $1dc6 into STA $001A.
    this.run(ABS_RMW);
    m[0x1cc8] = (m[0x1cc8] + 1) & 255;
    this.run(ABS_READ);
    this.run(IMMEDIATE);
    if (m[0x1cc8] === 3) {
      this.run(BRANCH_TAKEN);
      this.run(IMMEDIATE);
      this.run(ABS_WRITE);
      m[0x1dc8] = 0;
    } else this.run(BRANCH);
    this.run(JSR);
    this.rotateBars();
    this.run(JMP);
    // $1db2: the next IRQ, then the music and the KERNAL.
    this.run(IMMEDIATE); this.run(IMMEDIATE); this.run(ABS_WRITE); this.run(ABS_WRITE);
    this.run(IMMEDIATE); this.run(ABS_WRITE); this.run(IMMEDIATE); this.run(ABS_WRITE);
    this.run(ABS_WRITE);
    if (!m[0x1dc8]) m[0x001a] = 1;
    this.run(IMMEDIATE); this.run(ABS_WRITE); this.run(IMMEDIATE); this.run(ABS_WRITE);
    this.next(SCROLL_LINE, 0x1c2d);
    this.run(JMP);
    this.music();
  }

  // $1e0c: every other frame $1dd6 moves the fine scroll table at $1d39 one place on
  // (39 bytes, rotating right) and the border colours at $1d89 one place back (their
  // first goes to $1daf).
  rotateBars() {
    const m = this.memory;
    this.run(ABS_READ);
    this.run(IMMEDIATE);
    if (m[0x1e0b] !== 1) {
      this.run(BRANCH);
      this.run(ABS_RMW);
      m[0x1e0b]++;
      this.run(RTS);
      return;
    }
    this.run(BRANCH_TAKEN);
    this.run(IMMEDIATE);
    this.run(ABS_WRITE);
    m[0x1e0b] = 0;
    this.run(JMP);
    this.run(ABS_READ);
    this.run(ABS_WRITE);
    m[0x1e09] = m[0x1d5f];
    this.run(IMMEDIATE);
    for (let y = 0x25; y >= 0; y--) {
      this.run(ABS_READ);
      this.run(ABS_INDEXED_WRITE);
      m[0x1d3a + y] = m[0x1d39 + y];
      this.run(IMPLIED);
      this.run(IMMEDIATE);
      this.run(y ? BRANCH_TAKEN : BRANCH);
    }
    this.run(ABS_READ);
    this.run(ABS_WRITE);
    m[0x1d39] = m[0x1e09];
    this.run(ABS_READ);
    this.run(ABS_WRITE);
    m[0x1e0a] = m[0x1d89];
    this.run(IMMEDIATE);
    for (let y = 0; y < 40; y++) {
      this.run(ABS_READ);
      this.run(ABS_INDEXED_WRITE);
      m[0x1d89 + y] = m[0x1d8a + y];
      this.run(IMPLIED);
      this.run(IMMEDIATE);
      this.run(y < 39 ? BRANCH_CROSS : BRANCH);
    }
    this.run(ABS_READ);
    this.run(ABS_WRITE);
    m[0x1daf] = m[0x1e0a];
    this.run(RTS);
  }

  // $08cf plays the music (translated in music.js, which gives its bus cycles) and
  // continues in the KERNAL's IRQ handler: the jiffy clock, the keyboard scan and the
  // read of CIA 1's interrupt flags. A key pressed lands in the buffer at $c6.
  music() {
    const m = this.memory;
    this.mark(0x08cf);
    this.player.play();
    this.run(this.player.bus);
    m[0xa2] = (m[0xa2] + 1) & 255;
    if (!m[0xa2]) {
      m[0xa1] = (m[0xa1] + 1) & 255;
      if (!m[0xa1]) m[0xa0] = (m[0xa0] + 1) & 255;
    }
    this.run(kernalBus([m[0xa0], m[0xa1], m[0xa2]]));
    this.icrRead = this.clock;
    if (this.keyPressed) m[0xc6] = 1;
  }

  // ---- the IRQ at line 218, $1c2d ----

  // The scroll text's fine scroll at $1c71 steps $c7, $c5, $c3, $c1 (38 columns, two
  // pixels a frame); then row 21 moves a character left and the next character of the
  // text at $1800 (pointer $b0) enters at column 39. At the closing zero the pointer
  // goes back to $1800.
  scrollIrq() {
    const m = this.memory;
    this.mark(0x1c2d);
    this.run(IMMEDIATE); this.run(ABS_WRITE); this.run(IMMEDIATE); this.run(ABS_WRITE);
    this.run(IMMEDIATE); this.run(IMMEDIATE); this.run(ABS_WRITE); this.run(ABS_WRITE);
    this.next(BORDER_LINE, 0x1c5f);
    this.run(ABS_READ);
    this.write(this.run(ABS_WRITE), 0x16, m[0x1c71]);
    this.run(ABS_RMW);
    this.run(ABS_RMW);
    m[0x1c71] = (m[0x1c71] - 2) & 255;
    this.run(ABS_READ);
    this.run(IMMEDIATE);
    if (m[0x1c71] !== 0xbf) {
      this.run(BRANCH_TAKEN);
    } else {
      this.run(BRANCH);
      this.run(IMMEDIATE);
      this.run(ABS_WRITE);
      m[0x1c71] = 0xc7;
      this.run(JSR);
      this.coarseScroll();
    }
    this.run(JMP);
  }

  coarseScroll() {
    const m = this.memory;
    this.run(IMMEDIATE);
    for (let x = 0; x <= 40; x++) {
      this.run(ABS_READ);
      this.poke(this.run(ABS_INDEXED_WRITE), 0x0748 + x, m[0x0749 + x]);
      this.run(IMPLIED);
      this.run(IMMEDIATE);
      this.run(x < 40 ? BRANCH_TAKEN : BRANCH);
    }
    this.run(IMMEDIATE);
    for (;;) {
      const character = m[m[0xb0] | (m[0xb1] << 8)];
      this.run(INDIRECT_Y);
      this.run(IMMEDIATE);
      if (character) {
        this.run(BRANCH_TAKEN);
        this.poke(this.run(ABS_WRITE), 0x076f, character);
        break;
      }
      this.run(BRANCH);
      this.run(JSR); this.run(IMMEDIATE); this.run(IMMEDIATE);
      this.run(ZP_WRITE); this.run(ZP_WRITE); this.run(RTS);
      m[0xb0] = 0x00;
      m[0xb1] = 0x18;
      this.run(JMP);
    }
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

  // ---- the IRQ at line 234, $1c5f ----

  borderIrq() {
    this.mark(0x1c5f);
    this.run(IMMEDIATE); this.run(ABS_WRITE); this.run(IMMEDIATE); this.run(ABS_WRITE);
    this.run(IMMEDIATE);
    this.write(this.run(ABS_WRITE), 0x16, 0xc8);
    this.run(JMP);
    // $1ca4: the next IRQ.
    this.run(IMMEDIATE); this.run(IMMEDIATE); this.run(ABS_WRITE); this.run(ABS_WRITE);
    this.run(IMMEDIATE); this.run(ABS_WRITE); this.run(IMMEDIATE); this.run(ABS_WRITE);
    this.run(ABS_WRITE); this.run(IMMEDIATE); this.run(ABS_WRITE); this.run(IMMEDIATE);
    this.run(ABS_WRITE);
    this.next(BARS_LINE, 0x1cc9);
    this.run(JMP);
  }

  // ---- frame ----

  // Runs the program until `clock`, or until it reaches the game or hangs.
  runUntil(clock) {
    while (this.clock < clock && !this.done) this.main.next();
  }

  // A frame's picture covers raster line 28 to line 27 of the next frame. The display
  // gets the state at its start and the writes made during it.
  step() {
    const start = this.frame * CYCLES_PER_FRAME + FIRST_VISIBLE_LINE * CYCLES_PER_LINE;
    const end = start + CYCLES_PER_FRAME;
    this.runUntil(end);
    const base = this.frame * CYCLES_PER_FRAME;
    this.view.memory.set(this.shown.memory);
    this.view.colorRam.set(this.shown.colorRam);
    this.view.vic.set(this.shown.vic);
    const events = [], later = [];
    for (const event of this.pending) {
      if (event[0] >= end) { later.push(event); continue; }
      events.push([event[0] - base, event[1], event[2]]);
      const [, target, value] = event;
      if (target < RAM) this.shown.vic[target] = value;
      else if (target < COLOR) this.shown.memory[target - RAM] = value;
      else this.shown.colorRam[target - COLOR] = value;
    }
    this.pending = later;
    this.view.events = events.sort((a, b) => a[0] - b[0]);
    this.frame++;
  }
}

// The raster IRQ's line is reached at cycle 0; the CPU has to have polled after that.
export const IRQ_DELAY = 1;
