import { CYCLES_PER_FRAME, CYCLES_PER_LINE } from './timing.js';
import {
  IMPLIED, IMMEDIATE, ZP_READ, ZP_WRITE, ZP_INDEXED_READ, ZP_INDEXED_WRITE, ABS_READ,
  ABS_READ_CROSS, ABS_WRITE, ABS_INDEXED_WRITE, INDIRECT_Y, INDIRECT_Y_WRITE, JSR, RTS, JMP,
  JMP_INDIRECT, BRANCH, BRANCH_TAKEN, BRANCH_CROSS, PUSH, PULL, POLL_EARLY
} from './bus.js';

// A key leaves the intro through $1f00: PRINT CHR$(147), border and screen black, IOINIT,
// RESTOR and CINT; then a routine copied to $033c clears the screen once more, copies
// $2000-$FFFF down to $0801 and RUNs the game. The raster IRQs keep running all the
// while, until RESTOR hands the IRQ vector back to the KERNAL and CINT switches the
// raster IRQ off.
//
// The KERNAL's code is translated like the main loop, instruction by instruction on the
// modelled bus, so the IRQs break into it where they do in VICE.
const TAKEN = [BRANCH_TAKEN, POLL_EARLY];

// $1f00 to the JSR $E544 in the screen editor's output routine: CHROUT through $0326, to
// the screen, and the tests for the control codes up to CLR.
const CHROUT_TO_CLEAR = [
  IMMEDIATE, JSR, JMP_INDIRECT, PUSH, ZP_READ, IMMEDIATE, BRANCH, PULL, JMP,
  PUSH, ZP_WRITE, IMPLIED, PUSH, IMPLIED, PUSH, IMMEDIATE, ZP_WRITE, ZP_READ, ZP_READ, BRANCH,
  JMP, IMMEDIATE, IMMEDIATE, TAKEN, IMMEDIATE, TAKEN, IMMEDIATE, TAKEN, ZP_READ, BRANCH,
  IMMEDIATE, BRANCH_CROSS, ZP_READ, TAKEN, IMMEDIATE, TAKEN, IMMEDIATE, TAKEN, IMMEDIATE,
  TAKEN, IMMEDIATE, BRANCH, JSR
];
// From the clear's RTS back to $1f05.
const CLEAR_TO_RETURN = [
  JMP, PULL, IMPLIED, ZP_READ, TAKEN, PULL, IMPLIED, PULL, IMPLIED, IMPLIED, RTS
];
// $e9f0 (the line's screen address from the KERNAL's table at $ECF0, which line 16 on
// read across a page) and $ea24 (its colour RAM address).
const lineAddress = line => [
  0xf0 + line > 255 ? ABS_READ_CROSS : ABS_READ, ZP_WRITE, ZP_INDEXED_READ, IMMEDIATE, ABS_READ,
  ZP_WRITE, RTS
];
const COLOR_ADDRESS = [ZP_READ, ZP_WRITE, ZP_READ, IMMEDIATE, IMMEDIATE, ZP_WRITE, RTS];

// CINT ($ff81) writes the VIC-II's 47 registers from $d02e down, from the KERNAL's table
// at $ECB9 (its last byte is code): the raster IRQ off, light blue border, blue screen,
// the ROM's character set.
const VIC_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x9b, 0x37, 0, 0, 0, 0x08, 0, 0x14, 0x0f,
  0, 0, 0, 0, 0, 0, 0x0e, 0x06, 0x01, 0x02, 0x03, 0x04, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05,
  0x06, 0x07, 0x4c
];

// From $FF63 nothing visible changes (the clear at $033c writes the same spaces and
// light blue again, and the copy runs with the IRQs off); the game starts a fixed time
// later (VICE: 1,024,478 to 1,024,483 cycles).
const GAME = 1024481;

// CIA 1's timer A, the KERNAL's 60 Hz IRQ, keeps running under the intro with its IRQ
// masked, and the logo IRQ (through the KERNAL) reads its flags every frame. It
// underflows at clock 9746 and every 17046 cycles after. IOINIT stops it, enables its IRQ
// and starts it again. If it has underflowed since that read, the IRQ fires as soon as
// it is enabled, and the intro's handlers run one after the other, out of place: the
// handlers at $1957, $1a04 and $1b33 mask the timer's IRQ again, but the CIA holds the IRQ
// line until its flags are read, which only the logo handler, through the KERNAL, does.
const TIMER_FIRST = 9746, TIMER_PERIOD = 17046;
const LOGO = 0x1b33, MASKING = [0x1957, 0x1a04, LOGO];

class Timer {
  constructor() {
    this.flag = false;
    this.masked = true;
    // When the CIA pulls the IRQ line low, and the next underflow once restarted.
    this.irq = Infinity;
    this.next = Infinity;
  }

  // Underflows up to `clock`.
  tick(clock) {
    while (clock >= this.next) {
      this.flag = true;
      if (!this.masked) this.irq = Math.min(this.irq, this.next + 1);
      this.next += TIMER_PERIOD;
    }
  }

  // $dc0e = $08: stopped, with the flag of any underflow since `icrRead`.
  stop(clock, icrRead) {
    const k = Math.floor((icrRead - TIMER_FIRST) / TIMER_PERIOD) + 1;
    this.flag = TIMER_FIRST + k * TIMER_PERIOD <= clock;
  }

  // $dc0d = $81: the IRQ enabled, and the line low a cycle later if the flag is set.
  enable(clock) {
    this.masked = false;
    if (this.flag) this.irq = Math.min(this.irq, clock + 1);
  }

  // $dc0e = $11: loaded and started.
  start(clock) {
    this.next = clock + TIMER_PERIOD + 1;
  }

  read() {
    this.flag = false;
    this.irq = Infinity;
  }
}

// Runs a list of instructions through `op`.
function* ops(op, list) {
  for (const entry of list) {
    if (typeof entry === 'string') yield* op(entry);
    else yield* op(...entry);
  }
}

// $e544, the KERNAL's screen clear: from the bottom right, each character's colour (from
// $0286) 14 cycles before its space.
function* clearScreen(model, op) {
  const m = model.memory;
  // The line links (26 rounds; an INY when the low byte carries).
  yield* ops(op, [ABS_READ, IMMEDIATE, IMPLIED, IMMEDIATE, IMPLIED]);
  for (let x = 0, low = 0; x < 26; x++) {
    yield* ops(op, [ZP_INDEXED_WRITE, IMPLIED, IMMEDIATE]);
    low += 40;
    if (low > 255) {
      low -= 256;
      yield* ops(op, [BRANCH, IMPLIED]);
    } else yield* ops(op, [TAKEN]);
    yield* ops(op, [IMPLIED, IMMEDIATE, x < 25 ? TAKEN : BRANCH]);
  }
  yield* ops(op, [IMMEDIATE, ZP_INDEXED_WRITE, IMMEDIATE]);
  // CLRLN ($e9ff) for lines 24 down to 0, columns 39 down to 0.
  for (let line = 24; line >= 0; line--) {
    yield* ops(op, [JSR, IMMEDIATE, JSR, ...lineAddress(line), JSR, ...COLOR_ADDRESS]);
    for (let column = 39; column >= 0; column--) {
      const offset = line * 40 + column;
      yield* ops(op, [JSR, ABS_READ]);
      yield* op(INDIRECT_Y_WRITE, undefined, end => model.color(end, 0xd800 + offset, m[0x0286]));
      yield* ops(op, [RTS, IMMEDIATE]);
      yield* op(INDIRECT_Y_WRITE, undefined, end => model.poke(end, 0x0400 + offset, 0x20));
      yield* ops(op, [IMPLIED, column ? TAKEN : BRANCH]);
    }
    yield* ops(op, [RTS, IMPLIED, line ? TAKEN : BRANCH]);
  }
  // $e566: the cursor home, through $e9f0 and $ea24 for line 0.
  yield* ops(op, [
    IMMEDIATE, ZP_WRITE, ZP_WRITE, ZP_READ, ZP_READ, ZP_INDEXED_READ, TAKEN, JSR, ...lineAddress(0),
    IMMEDIATE, IMPLIED, ZP_INDEXED_READ, TAKEN, ZP_WRITE, JMP, ...COLOR_ADDRESS
  ]);
}

// $fddd: timer A set for 60 Hz (NTSC), its IRQ enabled, the timer started, then $ee8e.
function* startTimer(op, timer) {
  yield* ops(op, [ABS_READ, TAKEN, IMMEDIATE, ABS_WRITE, IMMEDIATE, ABS_WRITE, JMP, IMMEDIATE]);
  yield* op(ABS_WRITE, undefined, end => timer.enable(end));
  yield* ops(op, [ABS_READ, IMMEDIATE, IMMEDIATE]);
  yield* op(ABS_WRITE, undefined, end => timer.start(end));
  yield* ops(op, [JMP, ABS_READ, IMMEDIATE, ABS_WRITE, RTS]);
}

// The main thread from $1f00 to the game, on the model's IRQs. A raster IRQ that comes
// between RESTOR and CINT goes to the KERNAL, which never acknowledges it: the C64 then
// runs that IRQ for ever and the picture freezes.
export function* exitThread(model) {
  const m = model.memory;
  const timer = new Timer();
  let kernal = false;
  // Each instruction, its store (`store`, called with the store's clock), then the IRQs
  // it lets in, the raster's and the timer's. Whether one comes is settled in the poll
  // cycle, before the store.
  const op = function* (pattern, poll, store) {
    // Once hung, the main thread gets no further.
    while (model.hung) yield;
    const end = model.run(pattern, poll);
    let raster, due;
    const check = () => {
      timer.tick(model.clock);
      raster = !model.rasterOff && model.poll >= model.irqClock;
      due = raster || model.poll >= timer.irq;
    };
    check();
    if (store) store(end);
    for (; due; check()) {
      if (kernal) {
        if (raster) {
          model.hung = true;
          model.hangClock = model.clock;
          model.done = true;
          return end;
        }
        model.kernalInterrupt();
        timer.read();
      } else {
        const handler = model.handler;
        model.interrupt();
        if (MASKING.includes(handler)) timer.masked = true;
        if (handler === LOGO) timer.read();
      }
    }
    yield;
    return end;
  };

  yield* ops(op, CHROUT_TO_CLEAR);
  yield* clearScreen(model, op);
  yield* ops(op, CLEAR_TO_RETURN);
  // $1f05: border, screen and cursor colour black.
  yield* op(IMMEDIATE);
  yield* op(ABS_WRITE, undefined, end => model.write(end, 0x20, 0));
  yield* op(ABS_WRITE, undefined, end => model.write(end, 0x21, 0));
  yield* op(ABS_WRITE);
  m[0x0286] = 0;

  // IOINIT ($fda3): CIA 1's IRQs off, timer A stopped, the SID's volume 0, the ports.
  yield* ops(op, [JSR, IMMEDIATE, ABS_WRITE, ABS_WRITE, ABS_WRITE, IMMEDIATE]);
  yield* op(ABS_WRITE, undefined, end => timer.stop(end, model.icrRead));
  yield* ops(op, [ABS_WRITE, ABS_WRITE, ABS_WRITE, IMMEDIATE, ABS_WRITE, ABS_WRITE]);
  yield* op(ABS_WRITE, undefined, end => { model.silenceClock = end; });
  yield* ops(op, [
    IMPLIED, ABS_WRITE, IMMEDIATE, ABS_WRITE, IMMEDIATE, ABS_WRITE, IMMEDIATE, ZP_WRITE,
    IMMEDIATE, ZP_WRITE
  ]);
  yield* startTimer(op, timer);

  // RESTOR ($fd15): the 16 vectors at $0314 from the KERNAL's table, from the top down.
  // Once $0315 holds $EA, an IRQ goes to the KERNAL.
  yield* ops(op, [JSR, IMMEDIATE, IMMEDIATE, IMPLIED, ZP_WRITE, ZP_WRITE, IMMEDIATE]);
  for (let y = 0x1f; y >= 0; y--) {
    yield* ops(op, [ABS_READ, BRANCH, INDIRECT_Y, INDIRECT_Y_WRITE]);
    yield* op(ABS_INDEXED_WRITE, undefined, () => { if (y === 1) kernal = true; });
    yield* ops(op, [IMPLIED, y ? TAKEN : BRANCH]);
  }
  yield* op(RTS);

  // CINT: $ff81, $ff5b, $e518, $e5a0 (the VIC-II), the screen editor's variables (the
  // cursor colour light blue), and on into the clear.
  yield* ops(op, [JSR, JMP, JSR, JSR, IMMEDIATE, ZP_WRITE, IMMEDIATE, ZP_WRITE, IMMEDIATE]);
  for (let x = 0x2f; x > 0; x--) {
    yield* op(ABS_READ);
    const register = x - 1;
    yield* op(ABS_INDEXED_WRITE, undefined, end => {
      model.write(end, register, VIC_TABLE[register]);
      if (register === 0x1a) model.rasterOff = true;
    });
    yield* ops(op, [IMPLIED, x > 1 ? TAKEN : BRANCH]);
  }
  yield* ops(op, [
    RTS, IMMEDIATE, ABS_WRITE, ZP_WRITE, IMMEDIATE, ABS_WRITE, IMMEDIATE, ABS_WRITE, IMMEDIATE,
    ABS_WRITE, ABS_WRITE, IMMEDIATE, ABS_WRITE, IMMEDIATE, ABS_WRITE, IMMEDIATE, ZP_WRITE,
    ZP_WRITE
  ]);
  m[0x0286] = 14;
  yield* clearScreen(model, op);
  // $ff5e: wait for a raster line whose low byte is 0 (LDA $D012, BNE).
  for (;;) {
    const read = yield* op(ABS_READ);
    if (!(Math.floor((read % CYCLES_PER_FRAME) / CYCLES_PER_LINE) & 255)) break;
    yield* op(...TAKEN);
  }
  yield* op(BRANCH);
  // $ff63: the PAL/NTSC flag, then $fddd again.
  const release = model.releaseClock = model.clock;
  yield* ops(op, [ABS_READ, IMMEDIATE, ABS_WRITE, JMP]);
  yield* startTimer(op, timer);
  model.gameClock = release + GAME;
}
