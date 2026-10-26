import { CYCLES_PER_FRAME, CYCLES_PER_LINE, FIRST_VISIBLE_LINE } from './timing.js';
import { exitThread } from './exit-model.js';
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

// Clock 0 is line 0, cycle 0 of frame 0. The main loop starts in line 135, cycle 22.
const MAIN_START = 135 * 65 + 22;

// The five raster IRQs, by the line their compare value selects. The first one comes at
// line 55, once: $1900 enables the raster IRQ without setting $d012, so the compare
// value is the $37 CINT left there (with $d011's bit 8, which made it line 311, now
// clear).
const FIRST_LINE = 0x37;
const TOP_LINE = 0x32, TOP_END_LINE = 0x3a, MIDDLE_LINE = 0x52, MIDDLE_END_LINE = 0x5a;
const LOGO_LINE = 0x7a;
const TOP = 0x1925, TOP_END = 0x1957, MIDDLE = 0x19d5, MIDDLE_END = 0x1a04, LOGO = 0x1b33;
export { TOP, TOP_END, MIDDLE, MIDDLE_END, LOGO };

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

// Translation of the intro NewAge put on Sorcerer Lord (April 15, 1988). The program at
// $1800 clears the screen to black, switches to the character set at $0800, starts a
// drone on the SID ($1e00) and the raster IRQs ($1900), then waits at $182a for a key in
// the KERNAL's buffer. Five raster IRQs, through the KERNAL's $0314 vector, follow each
// other:
//
// - line 50, $1925: the top scroller's fine scroll (row 0, two pixels a frame) and, every
//   fourth frame, its coarse step.
// - line 58, $1957: 40 columns again; the text pointer at $b0, which both scrollers use,
//   swaps to the middle scroller's.
// - line 82, $19d5: the middle scroller's fine scroll (row 4, one pixel a frame) and,
//   every eighth frame, its coarse step.
// - line 90, $1a04: X scroll 0 and 38 columns for the rest of the screen.
// - line 122, $1b33: 55 rounds of 83 cycles, each setting the logo's two multicolours
//   ($d023 from $1BA3, $d022 from $1C10) and multicolour mode. A round is longer than a
//   line, so the colours change mid-line and slant across the logo. Every third frame the
//   tables rotate, one left and one right. Then the scrollers' colour RAM: row 0 from
//   $1AC6, rotating left, and row 4 from $1AEF, rotating right, every frame; every third
//   frame rows 5-8 and 18-22 take the next colour of the fade at $1CB4; and the KERNAL's
//   own IRQ handler, which scans the keyboard.
//
// Everything runs on a modelled bus: each instruction's cycles, the badlines' stalls and
// the IRQ's polling. So the IRQs break into the main loop's 8-cycle wait where they do in
// VICE, and the colour and screen stores land on the same cycles.
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
    this.irqClock = this.irqAt(1, FIRST_LINE);
    this.frame = 0;
    this.pending = [];
    // Set to false where only the sound is wanted.
    this.recording = true;
    this.marks = null;
    // The KERNAL's keyboard scan sees a key from this clock on.
    this.keyClock = Infinity;
    // For verification: leave at the first BEQ from this clock on, as VICE does when the
    // branch is patched.
    this.exitAt = Infinity;
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

  // A key goes down at `clock`; the next keyboard scan puts it in the buffer at $c6,
  // where the main loop finds it.
  pressKey(clock = this.clock) {
    this.keyClock = Math.min(this.keyClock, clock);
  }

  get keyPressed() {
    return this.keyClock !== Infinity;
  }

  get exited() {
    return this.exitClock >= 0;
  }

  // ---- events for the display ----

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

  // The main loop's instructions call this; between them the IRQ breaks in. RTI polls
  // too, so an IRQ that came due during a handler follows it at once: after the top
  // scroller's coarse step, the IRQ for line 58 is already waiting.
  * op(pattern, poll) {
    const end = this.run(pattern, poll);
    while (this.poll >= this.irqClock && !this.rasterOff) this.interrupt();
    yield;
    return end;
  }

  // The IRQ sequence and $ff48: save A, X and Y, test the break flag, JMP ($0314).
  enter() {
    this.run(INTERRUPT);
    this.run(PUSH); this.run(IMPLIED); this.run(PUSH); this.run(IMPLIED); this.run(PUSH);
    this.run(IMPLIED); this.run(ABS_READ); this.run(IMMEDIATE); this.run(BRANCH_TAKEN);
    this.run(JMP_INDIRECT);
  }

  // $ea81: restore Y, X and A, RTI.
  leave() {
    this.mark(0xea81);
    this.run(PULL); this.run(IMPLIED); this.run(PULL); this.run(IMPLIED); this.run(PULL);
    this.run(RTI);
  }

  // An IRQ once RESTOR has given $0314 back to the KERNAL.
  kernalInterrupt() {
    this.enter();
    this.kernal();
    this.leave();
  }

  interrupt() {
    this.enter();
    const handler = this.handler;
    if (handler === TOP) this.topIrq();
    else if (handler === TOP_END) this.topEndIrq();
    else if (handler === MIDDLE) this.middleIrq();
    else if (handler === MIDDLE_END) this.middleEndIrq();
    else {
      this.logoIrq();
      this.kernal();
    }
    this.leave();
  }

  // Sets the next IRQ: its line and the handler $0314 points at.
  next(line, handler) {
    const frame = Math.floor(this.clock / CYCLES_PER_FRAME);
    const local = this.clock - frame * CYCLES_PER_FRAME;
    this.handler = handler;
    this.irqClock = this.irqAt(local < line * CYCLES_PER_LINE ? frame : frame + 1, line);
  }

  // How the first four handlers start: acknowledge, the next compare line, and $0314.
  head(line, handler) {
    this.run(IMMEDIATE); this.run(ABS_WRITE); this.run(IMMEDIATE); this.run(ABS_WRITE);
    this.run(IMMEDIATE); this.run(IMMEDIATE); this.run(ABS_WRITE); this.run(ABS_WRITE);
    this.next(line, handler);
  }

  // $d011 $1b, acknowledge, a store of 1 to `enable` (the raster IRQ's enable register,
  // mostly), CIA 1's IRQs off.
  restore(enable) {
    this.run(IMMEDIATE);
    this.write(this.run(ABS_WRITE), 0x11, 0x1b);
    this.run(IMMEDIATE); this.run(ABS_WRITE);
    this.write(this.run(ABS_WRITE), enable, 1);
    this.run(IMMEDIATE); this.run(ABS_WRITE);
  }

  // ---- the main loop at $182a ----

  * mainLoop() {
    const m = this.memory;
    for (;;) {
      this.mark(0x182a);
      const keys = m[0xc6];
      yield* this.op(ZP_READ);
      yield* this.op(IMMEDIATE);
      if (keys || this.clock >= this.exitAt) {
        yield* this.op(BRANCH);
        yield* this.op(JMP);
        this.exitClock = this.clock;
        yield* exitThread(this);
        this.done = true;
        return;
      }
      yield* this.op(BRANCH_TAKEN, POLL_EARLY);
    }
  }

  // ---- shared pieces of the IRQs ----

  // JSR to the DEX/BPL wait at $1b9e: X + 1 rounds, then a NOP and RTS.
  delay(x) {
    this.run(JSR);
    for (;;) {
      this.run(IMPLIED);
      x = (x - 1) & 255;
      if (x & 0x80) break;
      this.run(BRANCH_TAKEN);
    }
    this.run(BRANCH);
    this.run(IMPLIED);
    this.run(RTS);
  }

  // A scroller's coarse step ($197e, $1a31): the row (41 bytes from `row`, so the first
  // byte of the next row as well) moves a character left and the next character of the
  // text at ($b0) enters at column 39. At the closing zero the text pointer, and its copy
  // at `save`, go back to `start` and the text is read again.
  coarseScroll(row, start, save) {
    const m = this.memory;
    this.run(JSR);
    this.run(IMMEDIATE);
    for (let x = 0; x < 41; x++) {
      this.run(ABS_READ);
      this.poke(this.run(ABS_INDEXED_WRITE), row + x, m[row + x + 1]);
      this.run(IMPLIED);
      this.run(IMMEDIATE);
      this.run(x < 40 ? BRANCH_TAKEN : BRANCH);
    }
    this.run(IMMEDIATE);
    let character;
    for (;;) {
      character = m[m[0xb0] | (m[0xb1] << 8)];
      this.run(INDIRECT_Y);
      this.run(IMMEDIATE);
      if (character) break;
      this.run(BRANCH);
      this.run(JSR);
      this.run(IMMEDIATE); this.run(IMMEDIATE); this.run(ZP_WRITE); this.run(ZP_WRITE);
      m[0xb0] = start & 255;
      m[0xb1] = start >> 8;
      this.run(ABS_WRITE); this.run(ABS_WRITE);
      m[save] = start & 255;
      m[save + 1] = start >> 8;
      this.run(RTS);
      this.run(JMP);
    }
    this.run(BRANCH_TAKEN);
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

  // ---- the IRQ at line 50, $1925 ----

  topIrq() {
    const m = this.memory;
    this.mark(TOP);
    this.head(TOP_END_LINE, TOP_END);
    // Two pixels a frame: $197d runs $C7, $C5, $C3, $C1.
    this.run(ABS_READ);
    this.write(this.run(ABS_WRITE), 0x16, m[0x197d]);
    this.run(ABS_RMW);
    this.run(ABS_RMW);
    m[0x197d] = (m[0x197d] - 2) & 255;
    this.run(ABS_READ);
    this.run(IMMEDIATE);
    if (m[0x197d] !== 0xbf) this.run(BRANCH_TAKEN);
    else {
      this.run(BRANCH);
      this.run(IMMEDIATE);
      this.run(ABS_WRITE);
      m[0x197d] = 0xc7;
      this.coarseScroll(0x0400, 0x1000, 0x1a79);
    }
    this.run(JMP);
  }

  // ---- the IRQ at line 58, $1957 ----

  topEndIrq() {
    const m = this.memory;
    this.mark(TOP_END);
    this.head(MIDDLE_LINE, MIDDLE);
    // Keep the top scroller's text pointer; 40 columns; the middle scroller's pointer.
    this.run(ZP_READ); this.run(ABS_WRITE); this.run(ZP_READ); this.run(ABS_WRITE);
    m[0x1a79] = m[0xb0];
    m[0x1a7a] = m[0xb1];
    this.run(IMMEDIATE);
    this.write(this.run(ABS_WRITE), 0x16, 0xc8);
    this.run(JMP);
    this.run(ABS_READ); this.run(ZP_WRITE); this.run(ABS_READ); this.run(ZP_WRITE);
    m[0xb0] = m[0x1a7b];
    m[0xb1] = m[0x1a7c];
    this.restore(0x1a);
    this.run(JMP);
  }

  // ---- the IRQ at line 82, $19d5 ----

  middleIrq() {
    const m = this.memory;
    this.mark(MIDDLE);
    this.head(MIDDLE_END_LINE, MIDDLE_END);
    // One pixel a frame: $1a21 runs $C7 down to $C0.
    this.run(ABS_READ);
    this.write(this.run(ABS_WRITE), 0x16, m[0x1a21]);
    this.run(ABS_RMW);
    m[0x1a21] = (m[0x1a21] - 1) & 255;
    this.run(ABS_READ);
    this.run(IMMEDIATE);
    // The BNE at $19f7 crosses into page $1a.
    if (m[0x1a21] !== 0xbf) this.run(BRANCH_CROSS);
    else {
      this.run(BRANCH);
      this.run(IMMEDIATE);
      this.run(ABS_WRITE);
      m[0x1a21] = 0xc7;
      this.coarseScroll(0x04a0, 0x1400, 0x1a7b);
    }
    this.run(JMP);
  }

  // ---- the IRQ at line 90, $1a04 ----

  middleEndIrq() {
    const m = this.memory;
    this.mark(MIDDLE_END);
    this.run(IMPLIED);
    this.run(IMMEDIATE); this.run(IMMEDIATE); this.run(ABS_WRITE); this.run(ABS_WRITE);
    // Keep the middle scroller's text pointer; X scroll 0, 38 columns.
    this.run(ZP_READ); this.run(ABS_WRITE); this.run(ZP_READ); this.run(ABS_WRITE);
    m[0x1a7b] = m[0xb0];
    m[0x1a7c] = m[0xb1];
    this.run(IMMEDIATE);
    this.write(this.run(ABS_WRITE), 0x16, 0xc0);
    this.run(JMP);
    // $1b18: the others' tail, but with its "enable" a store to $d01d (sprite X
    // expansion; no sprites are on); then line 122.
    this.restore(0x1d);
    this.run(IMMEDIATE); this.run(ABS_WRITE);
    this.next(LOGO_LINE, LOGO);
    this.run(JMP);
  }

  // ---- the IRQ at line 122, $1b33 ----

  logoIrq() {
    const m = this.memory, v = this.vic;
    this.mark(LOGO);
    this.run(IMMEDIATE); this.run(ABS_WRITE); this.run(IMMEDIATE); this.run(ABS_WRITE);
    // Round 0: the colours without multicolour mode, three NOPs in between.
    this.run(ABS_READ);
    this.run(IMPLIED); this.run(IMPLIED); this.run(IMPLIED);
    this.write(this.run(ABS_WRITE), 0x23, m[0x1ba3]);
    this.run(ABS_READ);
    this.write(this.run(ABS_WRITE), 0x22, m[0x1c10]);
    this.run(IMMEDIATE);
    this.delay(0);
    this.run(IMMEDIATE);
    // Rounds 1 to 54.
    for (let y = 1; y < 0x37; y++) {
      this.run(ABS_READ);
      this.write(this.run(ABS_WRITE), 0x23, m[0x1ba3 + y]);
      this.run(ABS_READ);
      this.write(this.run(ABS_WRITE), 0x22, m[0x1c10 + y]);
      this.run(ABS_READ);
      this.run(IMMEDIATE);
      this.write(this.run(ABS_WRITE), 0x16, v[0x16] | 0xd0);
      this.run(IMMEDIATE);
      this.delay(6);
      this.run(IMPLIED);
      this.run(IMMEDIATE);
      this.run(y < 0x36 ? BRANCH_TAKEN : BRANCH);
    }
    this.run(IMMEDIATE);
    this.delay(0);
    this.run(IMMEDIATE);
    this.write(this.run(ABS_WRITE), 0x23, 0);
    this.write(this.run(ABS_WRITE), 0x22, 0);
    this.run(ABS_READ);
    this.run(IMMEDIATE);
    this.write(this.run(ABS_WRITE), 0x16, (v[0x16] | 0xc0) & 0xef);
    // $1b86: every third frame the $d023 colours (55 at $1BA3) rotate left and the $d022
    // colours (56 at $1C10) right.
    this.run(ABS_RMW);
    m[0x1b32] = (m[0x1b32] + 1) & 255;
    this.run(ABS_READ);
    this.run(IMMEDIATE);
    if (m[0x1b32] !== 3) {
      this.run(BRANCH);
      this.run(JMP);
    } else {
      this.run(BRANCH_TAKEN);
      this.run(IMMEDIATE);
      this.run(ABS_WRITE);
      m[0x1b32] = 0;
      this.run(JSR);
      this.run(ABS_READ);
      this.run(ABS_WRITE);
      m[0x1bf8] = m[0x1ba3];
      this.run(IMMEDIATE);
      for (let y = 0; y < 0x37; y++) {
        this.run(ABS_READ);
        this.run(ABS_INDEXED_WRITE);
        m[0x1ba3 + y] = m[0x1ba4 + y];
        this.run(IMPLIED);
        this.run(IMMEDIATE);
        this.run(y < 0x36 ? BRANCH_TAKEN : BRANCH);
      }
      this.run(ABS_READ);
      this.run(ABS_WRITE);
      m[0x1bd9] = m[0x1bf8];
      this.run(JMP);
      this.run(ABS_READ);
      this.run(ABS_WRITE);
      m[0x1c63] = m[0x1c47];
      this.run(IMMEDIATE);
      for (let y = 0x36; y >= 0; y--) {
        this.run(ABS_READ);
        this.run(ABS_INDEXED_WRITE);
        m[0x1c11 + y] = m[0x1c10 + y];
        this.run(IMPLIED);
        this.run(IMMEDIATE);
        this.run(y ? BRANCH_TAKEN : BRANCH);
      }
      this.run(ABS_READ);
      this.run(ABS_WRITE);
      m[0x1c10] = m[0x1c63];
      this.run(RTS);
      this.run(JMP);
    }
    // $1bf9: next, the top IRQ at line 50.
    this.run(IMMEDIATE); this.run(IMMEDIATE); this.run(ABS_WRITE); this.run(ABS_WRITE);
    this.run(IMMEDIATE); this.run(ABS_WRITE);
    this.next(TOP_LINE, TOP);
    this.run(IMMEDIATE); this.run(ABS_WRITE);
    this.run(JMP);
    this.restore(0x1a);
    // The top scroller's text pointer back to $b0.
    this.run(ABS_READ); this.run(ZP_WRITE); this.run(ABS_READ); this.run(ZP_WRITE);
    m[0xb0] = m[0x1a79];
    m[0xb1] = m[0x1a7a];
    this.run(JMP);
    this.scrollerColors();
    this.fade();
  }

  // $1a7d: row 0's colours from $1AC6 and row 4's from $1AEF (40 each); then the first
  // table rotates left and the second right.
  scrollerColors() {
    const m = this.memory;
    this.run(IMMEDIATE);
    for (let x = 0; x < 0x28; x++) {
      this.run(ABS_READ);
      this.color(this.run(ABS_INDEXED_WRITE), 0xd800 + x, m[0x1ac6 + x]);
      this.run(0xef + x > 255 ? ABS_READ_CROSS : ABS_READ);
      this.color(this.run(ABS_INDEXED_WRITE), 0xd8a0 + x, m[0x1aef + x]);
      this.run(IMPLIED);
      this.run(IMMEDIATE);
      this.run(x < 0x27 ? BRANCH_TAKEN : BRANCH);
    }
    this.run(ABS_READ);
    this.run(ABS_WRITE);
    m[0x1ac5] = m[0x1ac6];
    this.run(IMMEDIATE);
    for (let y = 0; y < 0x27; y++) {
      this.run(ABS_READ);
      this.run(ABS_INDEXED_WRITE);
      m[0x1ac6 + y] = m[0x1ac7 + y];
      this.run(IMPLIED);
      this.run(IMMEDIATE);
      this.run(y < 0x26 ? BRANCH_TAKEN : BRANCH);
    }
    this.run(ABS_READ);
    this.run(ABS_WRITE);
    m[0x1aed] = m[0x1ac5];
    this.run(ABS_READ);
    this.run(ABS_WRITE);
    m[0x1ac5] = m[0x1b16];
    this.run(IMMEDIATE);
    for (let y = 0x26; y >= 0; y--) {
      this.run(0xef + y > 255 ? ABS_READ_CROSS : ABS_READ);
      this.run(ABS_INDEXED_WRITE);
      m[0x1af0 + y] = m[0x1aef + y];
      this.run(IMPLIED);
      this.run(IMMEDIATE);
      this.run(y ? BRANCH_TAKEN : BRANCH);
    }
    this.run(ABS_READ);
    this.run(ABS_WRITE);
    m[0x1aef] = m[0x1ac5];
    this.run(JMP);
  }

  // $1c64: every third frame rows 5 to 8 and 18 to 22 all take the next of the 22
  // colours at $1CB4: black, up through the greys to white, white for a while, and back.
  // Then on to the KERNAL.
  fade() {
    const m = this.memory;
    const ROWS = [0xd8c7, 0xd8ef, 0xd917, 0xd93f, 0xdaf7, 0xdb1f, 0xdb47, 0xdb6f, 0xdacf];
    for (;;) {
      this.run(ABS_READ);
      this.run(IMMEDIATE);
      if (m[0x1cca] !== 2) {
        this.run(BRANCH);
        this.run(ABS_RMW);
        m[0x1cca] = (m[0x1cca] + 1) & 255;
        this.run(JMP);
        return;
      }
      this.run(BRANCH_TAKEN);
      this.run(ABS_READ);
      this.run(IMMEDIATE);
      if (m[0x1cb3] !== 0x16) break;
      this.run(BRANCH_TAKEN);
      this.run(IMMEDIATE);
      this.run(ABS_WRITE);
      m[0x1cb3] = 0;
      this.run(JMP);
    }
    this.run(BRANCH);
    this.run(ABS_READ);
    const value = m[0x1cb4 + m[0x1cb3]];
    this.run(IMMEDIATE);
    for (let x = 0x28; x > 0; x--) {
      for (const row of ROWS) this.color(this.run(ABS_INDEXED_WRITE), row + x, value);
      this.run(IMPLIED);
      this.run(IMMEDIATE);
      if (x > 1) {
        this.run(BRANCH);
        this.run(JMP);
      } else this.run(BRANCH_TAKEN);
    }
    this.run(ABS_RMW);
    m[0x1cb3] = (m[0x1cb3] + 1) & 255;
    this.run(IMMEDIATE);
    this.run(ABS_WRITE);
    m[0x1cca] = 0;
    this.run(JMP);
  }

  // The KERNAL's IRQ handler at $ea31: the jiffy clock, the keyboard scan and the read of
  // CIA 1's interrupt flags. A key down lands in the buffer at $c6.
  kernal() {
    const m = this.memory;
    this.mark(0xea31);
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
