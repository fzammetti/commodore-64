import { CYCLES_PER_FRAME, CYCLES_PER_LINE, FIRST_VISIBLE_LINE } from './timing.js';
import { exitThread } from './exit-model.js';
import { play } from './music.js';
import {
  IMPLIED, IMMEDIATE, ZP_READ, ZP_WRITE, ZP_RMW, ABS_READ, ABS_READ_CROSS, ABS_WRITE,
  ABS_INDEXED_WRITE, ABS_RMW, INDIRECT_Y, JSR, RTS, JMP, JMP_INDIRECT, BRANCH, BRANCH_TAKEN,
  BRANCH_CROSS, PUSH, PULL, RTI, INTERRUPT, POLL_EARLY
} from './bus.js';

const RAM = 0x10000, COLOR = 0x20000;

// $d011 is $1b (Y scroll 3), so lines 51, 59 … 243 are badlines. From cycle 12 of a
// badline the VIC-II holds the CPU at its next read until cycle 55; writes go on.
const FIRST_BADLINE = 51, LAST_BADLINE = 243, Y_SCROLL = 3;
const STALL_FROM = 12, STALL_TO = 55;

// Clock 0 is line 0, cycle 0 of frame 0. The main loop starts in line 23, cycle 18;
// the first raster IRQ, $1833, is due at line 49.
const MAIN_START = 23 * 65 + 18;

// The three raster IRQs, by the line their compare value selects.
const TOP_LINE = 0x31, LOGO_LINE = 0x71, BOTTOM_LINE = 0xf1;
const TOP = 0x1833, LOGO = 0x1a90, BOTTOM = 0x1946;

// The KERNAL's IRQ handler from an IRQ's JMP $EA31 to $EA81, with no key down: UDTIM
// (the jiffy clock, then the STOP key), the cassette sense, SCNKEY, and the read of CIA
// 1's flags. A carry into $a1 adds a BNE not taken and an INC, one into $a0 two more.
const JIFFY = JMP + JSR + JMP + IMMEDIATE + ZP_RMW;
const KERNAL_TAIL = BRANCH_TAKEN
  + IMPLIED + ZP_READ + IMMEDIATE + ZP_READ + IMMEDIATE + ZP_READ + IMMEDIATE + BRANCH_TAKEN
  + ABS_READ + ABS_READ + BRANCH + IMPLIED + BRANCH_TAKEN + ZP_WRITE + RTS
  + ZP_READ + BRANCH_TAKEN + ZP_READ + IMMEDIATE + BRANCH + IMMEDIATE + ZP_WRITE + ZP_READ
  + IMMEDIATE + BRANCH_TAKEN + ZP_WRITE
  + JSR + IMMEDIATE + ABS_WRITE + IMMEDIATE + ZP_WRITE + ABS_WRITE + ABS_READ + IMMEDIATE
  + BRANCH_TAKEN + BRANCH_CROSS + ZP_READ + ZP_WRITE + ABS_READ + ABS_WRITE + IMMEDIATE
  + BRANCH_TAKEN + IMMEDIATE + ABS_WRITE + RTS + ABS_READ;

function kernalBus(jiffy) {
  const carry = jiffy[2] === 0, carryOn = carry && jiffy[1] === 0;
  if (!carry) return JIFFY + KERNAL_TAIL;
  if (!carryOn) return JIFFY + BRANCH + ZP_RMW + KERNAL_TAIL;
  return JIFFY + BRANCH + ZP_RMW + BRANCH + ZP_RMW + KERNAL_TAIL.slice(BRANCH_TAKEN.length);
}

// Translation of the intro NewAge put on Psynus V1.1 (April 1988). The program at $2500
// sets up the screen, the music ($17b3) and the raster IRQs ($1800), then loops at
// $2530: it calls the music player ($1302), leaves if a key is in the buffer and waits
// in a delay loop of six rounds of 226 DEX. That loop is not tied to the frame; the
// raster IRQs break into it, and into the music, wherever they fall. Three raster IRQs,
// through the KERNAL's $0314 vector, follow each other:
//
// - line 49, $1833: nine raster colours from $18D7 behind the top scroller (row 0, its
//   characters reversed, so the colours show through the letters), the scroller's fine
//   scroll (one pixel a frame), and every fourth frame the colours rotate.
// - line 113, $1a90: 49 lines over the logo (rows 7 to 14, built from spaces and
//   reversed spaces), each setting the background from $1AEE and the X scroll from
//   $1B20. The scroll table slants and bends the logo; every third frame it rotates,
//   which sets the logo waving.
// - line 241, $1946: the bottom scroller (row 24) like the top one, two pixels a frame;
//   every third frame the colours of rows 17 to 20 rotate; then the KERNAL's own IRQ
//   handler, which scans the keyboard.
//
// Everything runs on a modelled bus: each instruction's cycles, the badlines' stalls and
// the IRQ's polling, so the raster colours and stores land on the cycles they do in
// VICE, and the music's SID writes come at the times the main loop reaches them.
export class IntroModel {
  // The assets: RAM and I/O as they stood when the main loop began (VICE).
  constructor({ ram, io }) {
    this.memory = new Uint8Array(ram).slice();
    if (this.memory.length !== 65536) throw new Error('IntroModel requires 64 KiB of RAM.');
    this.colorRam = new Uint8Array(io.subarray(0x800, 0xc00)).map(value => value & 15);
    this.vic = new Uint8Array(64);
    this.vic.set(io.subarray(0, 47));
    this.vic[0x18] &= 0xfe;
    this.clock = MAIN_START;
    this.poll = 0;
    this.handler = TOP;
    this.irqClock = this.irqAt(0, TOP_LINE);
    this.frame = 0;
    this.pending = [];
    // Set to false where only the sound is wanted.
    this.recording = true;
    this.sidWrites = [];
    this.marks = null;
    // The KERNAL's keyboard scan sees a key from this clock on.
    this.keyClock = Infinity;
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
    this.hangClock = Infinity;
    this.done = false;
    this.rasterOff = false;
    // When the KERNAL's IRQ handler last read CIA 1's interrupt flags.
    this.icrRead = 0;
    this.main = this.mainLoop();
    this.shown = {
      memory: this.memory.slice(), colorRam: this.colorRam.slice(), vic: this.vic.slice()
    };
    this.view = {
      memory: this.memory.slice(), colorRam: this.colorRam.slice(), vic: this.vic.slice(), events: []
    };
  }

  // A key goes down at `clock`; the next keyboard scan puts it in the buffer at $c6, and
  // the main loop looks there once a round.
  pressKey(clock = this.clock) {
    this.keyClock = Math.min(this.keyClock, clock);
  }

  get keyPressed() {
    return this.keyClock !== Infinity;
  }

  get exited() {
    return this.exitClock >= 0;
  }

  // ---- events for the display and the sound ----

  write(clock, register, value) {
    this.vic[register] = value & 255;
    if (this.recording) this.pending.push([clock, register, value & 255]);
  }

  poke(clock, address, value) {
    this.memory[address] = value;
    if (this.recording && address >= 0x0400 && address < 0x0800) this.pending.push([clock, RAM + address, value]);
  }

  color(clock, address, value) {
    this.colorRam[address - 0xd800] = value & 15;
    if (this.recording) this.pending.push([clock, COLOR + address - 0xd800, value & 15]);
  }

  sid(clock, register, value) {
    this.sidWrites.push([clock, register, value]);
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

  // The main loop's instructions (and the music's) call this; between them the IRQ
  // breaks in.
  * op(pattern, poll) {
    const end = this.run(pattern, poll);
    if (this.poll >= this.irqClock && !this.rasterOff) this.interrupt();
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
    if (handler === TOP) this.topIrq();
    else if (handler === LOGO) this.logoIrq();
    else this.bottomIrq();
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

  // The tail all three handlers share: $0314, 40 columns, $d011, acknowledge and enable
  // the raster IRQ, CIA 1's IRQs off, the next line.
  chain(line, handler) {
    this.run(IMMEDIATE); this.run(IMMEDIATE); this.run(ABS_WRITE); this.run(ABS_WRITE);
    this.run(IMMEDIATE);
    this.write(this.run(ABS_WRITE), 0x16, 0xc8);
    this.run(IMMEDIATE);
    this.write(this.run(ABS_WRITE), 0x11, 0x1b);
    this.run(IMMEDIATE); this.run(ABS_WRITE);
    this.run(ABS_WRITE); this.run(IMMEDIATE); this.run(ABS_WRITE); this.run(IMMEDIATE);
    this.run(ABS_WRITE);
    this.next(line, handler);
    this.run(JMP);
  }

  // ---- the main loop at $2530 ----

  * mainLoop() {
    const m = this.memory;
    for (;;) {
      this.mark(0x2530);
      yield* this.op(JSR);
      yield* play(this);
      // $2533: a key in the buffer leaves through $2550.
      this.mark(0x2533);
      const keys = m[0xc6] || ++this.rounds === this.exitRound;
      yield* this.op(ZP_READ);
      yield* this.op(IMMEDIATE);
      if (keys) {
        yield* this.op(BRANCH_TAKEN, POLL_EARLY);
        yield* this.op(JMP);
        this.exitClock = this.clock;
        yield* exitThread(this);
        this.done = true;
        return;
      }
      yield* this.op(BRANCH);
      // $2539: six rounds of 226 DEX.
      yield* this.op(IMMEDIATE);
      for (let y = 5; ; y--) {
        yield* this.op(IMMEDIATE);
        for (let x = 0xe1; x >= 0; x--) {
          yield* this.op(IMPLIED);
          yield* this.op(IMMEDIATE);
          if (x) yield* this.op(BRANCH_TAKEN, POLL_EARLY);
          else yield* this.op(BRANCH);
        }
        yield* this.op(IMMEDIATE);
        if (!y) {
          yield* this.op(BRANCH_TAKEN, POLL_EARLY);
          break;
        }
        yield* this.op(BRANCH);
        yield* this.op(IMPLIED);
        yield* this.op(JMP);
      }
      yield* this.op(JMP);
    }
  }

  // ---- shared pieces of the IRQs ----

  // JSR to a DEX/BPL wait of X + 1 rounds, with a NOP before its RTS when `nop`.
  delay(x, nop) {
    this.run(JSR);
    for (;;) {
      this.run(IMPLIED);
      x = (x - 1) & 255;
      if (x & 0x80) break;
      this.run(BRANCH_TAKEN);
    }
    this.run(BRANCH);
    if (nop) this.run(IMPLIED);
    this.run(RTS);
  }

  // Nine raster colours behind a scroller row: the first from `colors` with the fine
  // scroll from `colors - 1`, then eight more 60 cycles apart; then black and 40 columns.
  scrollerBars(colors) {
    const m = this.memory;
    this.run(ABS_READ);
    this.write(this.run(ABS_WRITE), 0x21, m[colors]);
    this.run(ABS_READ);
    this.write(this.run(ABS_WRITE), 0x16, m[colors - 1]);
    this.run(IMMEDIATE);
    this.delay(1, true);
    for (let y = 1; y < 9; y++) {
      this.run(ABS_READ);
      this.write(this.run(ABS_WRITE), 0x21, m[colors + y]);
      this.run(IMMEDIATE);
      this.delay(5, true);
      this.run(IMPLIED);
      this.run(IMMEDIATE);
      this.run(y < 8 ? BRANCH_TAKEN : BRANCH);
    }
    this.run(IMMEDIATE);
    this.write(this.run(ABS_WRITE), 0x21, 0);
    this.run(IMMEDIATE);
    this.write(this.run(ABS_WRITE), 0x16, 0xc8);
  }

  // A scroller's coarse step: the row (40 bytes from `row`) moves a character left and
  // the next character of the text at ($b0) enters at the right. At the closing zero
  // the text pointer, and its copy at `save`, go back to `start`, and the row's last
  // character keeps the byte after the row.
  coarseScroll(row, start, save) {
    const m = this.memory;
    this.run(IMMEDIATE);
    for (let x = 0; x < 40; x++) {
      this.run(ABS_READ);
      this.poke(this.run(ABS_INDEXED_WRITE), row + x, m[row + x + 1]);
      this.run(IMPLIED);
      this.run(IMMEDIATE);
      this.run(x < 39 ? BRANCH_TAKEN : BRANCH);
    }
    this.run(IMMEDIATE);
    const character = m[m[0xb0] | (m[0xb1] << 8)];
    this.run(INDIRECT_Y);
    this.run(IMMEDIATE);
    if (!character) {
      this.run(BRANCH_TAKEN);
      this.run(IMMEDIATE); this.run(IMMEDIATE); this.run(ZP_WRITE); this.run(ZP_WRITE);
      m[0xb0] = start & 255;
      m[0xb1] = start >> 8;
      this.run(ABS_WRITE); this.run(ABS_WRITE);
      m[save] = start & 255;
      m[save + 1] = start >> 8;
      this.run(RTS);
      return;
    }
    this.run(BRANCH);
    this.poke(this.run(ABS_WRITE), row + 39, character);
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

  // A counter at `counter` that runs to `limit`; then it restarts and `action` runs (as
  // a JSR). The caller's JMP follows.
  every(counter, limit, action) {
    const m = this.memory;
    this.run(ABS_READ);
    this.run(IMMEDIATE);
    if (m[counter] !== limit) {
      this.run(BRANCH);
      this.run(ABS_RMW);
      m[counter] = (m[counter] + 1) & 255;
      return;
    }
    this.run(BRANCH_TAKEN);
    this.run(IMMEDIATE);
    this.run(ABS_WRITE);
    m[counter] = 0;
    this.run(JSR);
    action();
  }

  // ---- the IRQ at line 49, $1833 ----

  topIrq() {
    const m = this.memory;
    this.mark(TOP);
    // The top scroller's text pointer from $1A62; acknowledge.
    this.run(ABS_READ); this.run(ZP_WRITE); this.run(ABS_READ); this.run(ZP_WRITE);
    m[0xb0] = m[0x1a62];
    m[0xb1] = m[0x1a63];
    this.run(ZP_READ); this.run(ABS_WRITE);
    this.run(IMMEDIATE); this.run(IMPLIED);
    this.scrollerBars(0x18d7);
    // $1870, $1894: one pixel a frame ($18D6 runs $C7 down to $C0).
    this.run(JSR);
    this.run(ABS_RMW);
    m[0x18d6] = (m[0x18d6] - 1) & 255;
    this.run(ABS_READ);
    this.run(IMMEDIATE);
    if (m[0x18d6] !== 0xbf) {
      this.run(BRANCH);
      this.run(RTS);
    } else {
      this.run(BRANCH_TAKEN);
      this.run(IMMEDIATE);
      this.run(ABS_WRITE);
      m[0x18d6] = 0xc7;
      this.coarseScroll(0x0400, 0x1d00, 0x1a62);
    }
    // $1873: every fourth frame the 31 colours at $18D7 rotate right.
    this.every(0x188b, 3, () => {
      this.run(ABS_READ);
      this.run(ABS_WRITE);
      m[0x1912] = m[0x18f5];
      this.run(IMMEDIATE);
      for (let y = 0x1e; y >= 0; y--) {
        this.run(ABS_READ);
        this.run(ABS_INDEXED_WRITE);
        m[0x18d8 + y] = m[0x18d7 + y];
        this.run(IMPLIED);
        this.run(IMMEDIATE);
        this.run(y ? BRANCH_TAKEN : BRANCH);
      }
      this.run(ABS_READ);
      this.run(ABS_WRITE);
      m[0x18d7] = m[0x1912];
      this.run(RTS);
    });
    this.run(JMP);
    this.run(JMP);
    // $1a66: next, the logo IRQ.
    this.chain(LOGO_LINE, LOGO);
  }

  // ---- the IRQ at line 113, $1a90 ----

  logoIrq() {
    const m = this.memory;
    this.mark(LOGO);
    this.run(IMMEDIATE); this.run(ABS_WRITE); this.run(IMMEDIATE); this.run(ABS_WRITE);
    // 49 lines: background from $1AEE, X scroll from $1B20; the first without the wait.
    for (let y = 0; y < 49; y++) {
      this.run(y ? (0xee + y > 255 ? ABS_READ_CROSS : ABS_READ) : ABS_READ);
      this.write(this.run(ABS_WRITE), 0x21, m[0x1aee + y]);
      this.run(ABS_READ);
      this.write(this.run(ABS_WRITE), 0x16, m[0x1b20 + y]);
      this.run(IMMEDIATE);
      this.delay(y ? 4 : 0, false);
      if (!y) this.run(IMMEDIATE);
      else {
        this.run(IMPLIED);
        this.run(IMMEDIATE);
        this.run(y < 48 ? BRANCH_TAKEN : BRANCH);
      }
    }
    this.run(IMMEDIATE);
    this.delay(0, false);
    this.run(IMMEDIATE);
    this.write(this.run(ABS_WRITE), 0x21, 0);
    this.run(IMMEDIATE);
    this.write(this.run(ABS_WRITE), 0x16, 0xc8);
    // $1ad2: every third frame the 49 X scrolls at $1B20 rotate left.
    this.run(ABS_RMW);
    m[0x1a8f] = (m[0x1a8f] + 1) & 255;
    this.run(ABS_READ);
    this.run(IMMEDIATE);
    if (m[0x1a8f] !== 3) this.run(BRANCH);
    else {
      this.run(BRANCH_TAKEN);
      this.run(IMMEDIATE);
      this.run(ABS_WRITE);
      m[0x1a8f] = 0;
      this.run(JSR);
      this.run(ABS_READ);
      this.run(ABS_WRITE);
      m[0x1b6b] = m[0x1b20];
      this.run(IMMEDIATE);
      for (let y = 0; y < 0x31; y++) {
        this.run(ABS_READ);
        this.run(ABS_INDEXED_WRITE);
        m[0x1b20 + y] = m[0x1b21 + y];
        this.run(IMPLIED);
        this.run(IMMEDIATE);
        this.run(y < 0x30 ? BRANCH_TAKEN : BRANCH);
      }
      this.run(ABS_READ);
      this.run(ABS_WRITE);
      m[0x1b50] = m[0x1b6b];
      this.run(RTS);
    }
    this.run(JMP);
    // $1913: keep the top scroller's text pointer; next, the bottom IRQ.
    this.run(ZP_READ); this.run(ABS_WRITE); this.run(ZP_READ); this.run(ABS_WRITE);
    m[0x1a62] = m[0xb0];
    m[0x1a63] = m[0xb1];
    this.chain(BOTTOM_LINE, BOTTOM);
  }

  // ---- the IRQ at line 241, $1946 ----

  bottomIrq() {
    const m = this.memory;
    this.mark(BOTTOM);
    this.run(ABS_READ); this.run(ZP_WRITE); this.run(ABS_READ); this.run(ZP_WRITE);
    m[0xb0] = m[0x1a64];
    m[0xb1] = m[0x1a65];
    this.run(ZP_READ); this.run(ABS_WRITE);
    this.run(IMMEDIATE); this.run(IMMEDIATE); this.run(ABS_WRITE);
    this.scrollerBars(0x19f1);
    // $1987, $19ab: two pixels a frame ($19F0 runs $C7, $C5, $C3, $C1).
    this.run(JSR);
    this.run(ABS_RMW);
    this.run(ABS_RMW);
    m[0x19f0] = (m[0x19f0] - 2) & 255;
    this.run(ABS_READ);
    this.run(IMMEDIATE);
    if (m[0x19f0] !== 0xbf) {
      this.run(BRANCH);
      this.run(RTS);
    } else {
      this.run(BRANCH_TAKEN);
      this.run(IMMEDIATE);
      this.run(ABS_WRITE);
      m[0x19f0] = 0xc7;
      this.coarseScroll(0x07c0, 0x2100, 0x1a64);
    }
    // $198a: every fourth frame the 32 colours at $19F1 rotate left.
    this.every(0x19a2, 3, () => {
      this.run(ABS_READ);
      this.run(ABS_WRITE);
      m[0x1912] = m[0x19f1];
      this.run(IMMEDIATE);
      for (let y = 0; y < 0x20; y++) {
        this.run(0xf2 + y > 255 ? ABS_READ_CROSS : ABS_READ);
        this.run(ABS_INDEXED_WRITE);
        m[0x19f1 + y] = m[0x19f2 + y];
        this.run(IMPLIED);
        this.run(IMMEDIATE);
        this.run(y < 0x1f ? BRANCH_TAKEN : BRANCH);
      }
      this.run(ABS_READ);
      this.run(ABS_WRITE);
      m[0x1a10] = m[0x1912];
      this.run(RTS);
    });
    this.run(JMP);
    this.run(JMP);
    // $1a2c: keep the bottom scroller's text pointer.
    this.run(ZP_READ); this.run(ABS_WRITE); this.run(ZP_READ); this.run(ABS_WRITE);
    m[0x1a64] = m[0xb0];
    m[0x1a65] = m[0xb1];
    this.run(JSR);
    this.cycleColors();
    // $1a39: next, the top IRQ; then the KERNAL.
    this.chain(TOP_LINE, TOP);
    this.kernal();
  }

  // $1bb3: every third frame rows 17 to 20 take their colours from $1BE4 (40 bytes),
  // and the 40 at $1BE3 rotate left. The table runs black, greys and white, so the
  // greetings fade in and out across the rows.
  cycleColors() {
    const m = this.memory;
    this.run(ABS_READ);
    this.run(IMMEDIATE);
    if (m[0x1bbe] !== 2) {
      this.run(BRANCH);
      this.run(ABS_RMW);
      m[0x1bbe] = (m[0x1bbe] + 1) & 255;
      this.run(RTS);
      return;
    }
    this.run(BRANCH_TAKEN);
    this.run(IMMEDIATE);
    this.run(ABS_WRITE);
    m[0x1bbe] = 0;
    this.run(IMMEDIATE);
    this.run(IMMEDIATE);
    for (let y = 40; y > 0; y--) {
      this.run(0xe3 + y > 255 ? ABS_READ_CROSS : ABS_READ);
      const value = m[0x1be3 + y];
      for (const row of [0xdaa7, 0xdacf, 0xdaf7, 0xdb1f]) {
        this.color(this.run(ABS_INDEXED_WRITE), row + y, value);
      }
      this.run(IMPLIED);
      this.run(IMMEDIATE);
      if (y > 1) {
        this.run(BRANCH);
        this.run(JMP);
      } else this.run(BRANCH_TAKEN);
    }
    this.run(IMPLIED);
    this.run(JMP);
    this.run(ABS_READ);
    this.run(ABS_WRITE);
    m[0x1c39] = m[0x1be3];
    this.run(IMMEDIATE);
    for (let y = 0; y < 0x28; y++) {
      this.run(0xe4 + y > 255 ? ABS_READ_CROSS : ABS_READ);
      this.run(ABS_INDEXED_WRITE);
      m[0x1be3 + y] = m[0x1be4 + y];
      this.run(IMPLIED);
      this.run(IMMEDIATE);
      this.run(y < 0x27 ? BRANCH_TAKEN : BRANCH);
    }
    this.run(ABS_READ);
    this.run(ABS_WRITE);
    m[0x1c0a] = m[0x1c39];
    this.run(RTS);
  }

  // The KERNAL's IRQ handler at $ea31: the jiffy clock, the keyboard scan and the read of
  // CIA 1's interrupt flags. A key down lands in the buffer at $c6.
  kernal() {
    const m = this.memory;
    m[0xa2] = (m[0xa2] + 1) & 255;
    if (!m[0xa2]) {
      m[0xa1] = (m[0xa1] + 1) & 255;
      if (!m[0xa1]) m[0xa0] = (m[0xa0] + 1) & 255;
    }
    this.run(kernalBus([m[0xa0], m[0xa1], m[0xa2]]).slice(JMP.length));
    this.icrRead = this.clock;
    if (this.clock >= this.keyClock) m[0xc6] = 1;
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
