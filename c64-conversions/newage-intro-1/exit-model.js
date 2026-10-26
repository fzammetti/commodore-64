import { CYCLES_PER_FRAME, CYCLES_PER_LINE } from './timing.js';
import {
  IMPLIED, IMMEDIATE, ZP_READ, ZP_WRITE, ZP_INDEXED_READ, ABS_READ, ABS_READ_CROSS, INDIRECT_Y_WRITE,
  JSR, RTS, BRANCH, BRANCH_TAKEN, POLL_EARLY
} from './bus.js';

const RAM = 0x10000, COLOR = 0x20000;

// A key leaves the intro through $1000, which jumps to $1200: border and screen black,
// cursor colour black, then PRINT CHR$(147), IOINIT, RESTOR and CINT, and the routine
// at $1003 that copies $2800-$FFFF down to $0801 and RUNs the game. The raster IRQs
// keep running all the while, until RESTOR hands the IRQ vector back to the KERNAL and
// CINT switches the raster IRQ off.
//
// The KERNAL's part runs on the main thread, so it only advances in the cycles the IRQs
// and the badlines leave it. Its stores are given here in those cycles as VICE traced
// them (x64sc, NTSC): the same on every trace, whatever the IRQs did meanwhile. First
// from the jump at $1f61: border and screen black, and the first colour RAM store of
// the clear, which runs instruction by instruction (`clear` below).
const BORDER_BLACK = 12, SCREEN_BLACK = 16, BLACK_CLEAR = 717;
// Then from the clear's last store: IOINIT stops timer A, sets the SID's volume to
// zero, enables timer A's IRQ and starts the timer again; RESTOR sets $0314 to $EA31
// last; CINT writes the VIC-II's 47 registers from $d02e down, 14 cycles apart, from
// the KERNAL's table at $ECB9 (its last byte is code), and clears the screen again in
// light blue.
const STOP_TIMER = 167, SILENCE = 193, ENABLE_TIMER = 249, START_TIMER = 261;
const RESTORE = 1159, VIC_INIT = 1211, BLUE_CLEAR = 2492;
const VIC_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x9b, 0x37, 0, 0, 0, 0x08, 0, 0x14, 0x0f,
  0, 0, 0, 0, 0, 0, 0x0e, 0x06, 0x01, 0x02, 0x03, 0x04, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05,
  0x06, 0x07, 0x4c
];
const RASTER_OFF = VIC_INIT + (0x2e - 0x1a) * 14;
// After the second clear CINT waits for raster line 256; from there $1003 copies the
// game for about 58 frames with the IRQs off and RUNs it.
const SYNC_LINE = 256, GAME = 989635;

// CIA 1's timer A, the KERNAL's 60 Hz IRQ, keeps running under the intro with its IRQ
// masked, and the bars IRQ reads its flags every frame. It underflows at clock 10186
// and every 17046 cycles after. If it has underflowed since that read, the IRQ IOINIT
// enables fires at once, and the intro's handlers run one after the other until the
// bars handler reads the flags; the bars and border handlers mask timer A again.
const TIMER_FIRST = 10186, TIMER_PERIOD = 17046;
// After RESTOR an IRQ runs the KERNAL's handler, 219 cycles, starting 7 cycles after
// the timer underflows. The main thread's instruction delays a raster IRQ about 5.
const KERNAL_IRQ = 219, TIMER_LATENCY = 7, RASTER_LATENCY = 5, ENABLE_LATENCY = 5;

// The screen clears from the bottom right: colour RAM, then the space 14 cycles later,
// 35 cycles a character. A new line costs 113 cycles, 114 for lines 17 to 24, whose
// lookup in the KERNAL's line table crosses a page.
function clearSchedule(start, color) {
  const writes = [];
  let tau = start;
  for (let line = 24; line >= 0; line--) {
    for (let column = 39; column >= 0; column--) {
      const offset = line * 40 + column;
      writes.push([tau, COLOR + offset, color], [tau + 14, RAM + 0x0400 + offset, 0x20]);
      if (column) tau += 35;
    }
    tau += line > 16 ? 114 : 113;
  }
  return writes;
}

// The main thread's writes as [cycle, target, value], in order, before and after the
// black clear. That starts with the JSR $E4DA before its first store and ends 14 cycles
// after its last, with line 0's DEY, BPL, RTS, DEX and BPL.
const BEFORE = [[BORDER_BLACK, 0x20, 0], [SCREEN_BLACK, 0x21, 0]];
const AFTER = [
  ...VIC_TABLE.map((value, register) => [VIC_INIT + (0x2e - register) * 14, register, value]),
  ...clearSchedule(BLUE_CLEAR, 14)
].sort((a, b) => a[0] - b[0]);
const CLEAR_LOOP = BLACK_CLEAR - 16, CLEAR_END = 14;

// The main thread from the jump at $1f61 to the game, on the model's IRQs. A raster IRQ
// that comes between RESTOR and CINT goes to the KERNAL, which never acknowledges it:
// the C64 then runs that IRQ for ever on a black screen (in VICE about one exit in ten).
export function* exitThread(model) {
  const state = {
    tau: 0, cleared: false, kernal: false,
    timerFlag: false, timerIrq: Infinity, timerMasked: true, timerNext: Infinity
  };
  yield* scripted(model, state, BEFORE, CLEAR_LOOP);
  yield* clear(model, 0);
  state.tau = CLEAR_END;
  state.cleared = true;
  yield* scripted(model, state, AFTER, AFTER[AFTER.length - 1][0]);
  if (model.hung) return;
  // CINT waits for raster line 256; the game starts a fixed time after.
  let sync = Math.floor(model.clock / CYCLES_PER_FRAME) * CYCLES_PER_FRAME + SYNC_LINE * CYCLES_PER_LINE;
  if (sync < model.clock) sync += CYCLES_PER_FRAME;
  model.gameClock = sync + GAME;
}

// $E544 clearing the screen with colour `color`: $E9FF clears a line from the right,
// through $E4DA for each colour RAM byte; the lines go from 24 up to 0.
function* clear(model, color) {
  for (let line = 24; line >= 0; line--) {
    for (let column = 39; column >= 0; column--) {
      const offset = line * 40 + column;
      yield* model.op(JSR);
      yield* model.op(ABS_READ);
      model.color(yield* model.op(INDIRECT_Y_WRITE), 0xd800 + offset, color);
      yield* model.op(RTS);
      yield* model.op(IMMEDIATE);
      model.poke(yield* model.op(INDIRECT_Y_WRITE), 0x0400 + offset, 0x20);
      yield* model.op(IMPLIED);
      if (column) yield* model.op(BRANCH_TAKEN, POLL_EARLY);
      else yield* model.op(BRANCH);
    }
    yield* model.op(RTS);
    yield* model.op(IMPLIED);
    if (!line) {
      yield* model.op(BRANCH);
      return;
    }
    yield* model.op(BRANCH_TAKEN, POLL_EARLY);
    // $E9FF: the next line's screen pointer ($E9F0) and colour pointer ($EA24).
    yield* model.op(JSR);
    yield* model.op(IMMEDIATE);
    yield* model.op(JSR);
    yield* model.op(line - 1 >= 16 ? ABS_READ_CROSS : ABS_READ);
    yield* model.op(ZP_WRITE);
    yield* model.op(ZP_INDEXED_READ);
    yield* model.op(IMMEDIATE);
    yield* model.op(ABS_READ);
    yield* model.op(ZP_WRITE);
    yield* model.op(RTS);
    yield* model.op(JSR);
    yield* model.op(ZP_READ);
    yield* model.op(ZP_WRITE);
    yield* model.op(ZP_READ);
    yield* model.op(IMMEDIATE);
    yield* model.op(IMMEDIATE);
    yield* model.op(ZP_WRITE);
    yield* model.op(RTS);
  }
}

// The main thread, cycle by cycle, up to `until` of its cycles. The IRQs
// come about 5 cycles after their raster line, when the instruction ends.
function* scripted(model, state, script, until) {
  let next = 0;
  while (next < script.length && script[next][0] <= state.tau) next++;
  while (state.tau < until) {
    const clock = model.clock;
    if (clock >= state.timerNext) {
      state.timerFlag = true;
      if (!state.timerMasked) state.timerIrq = Math.min(state.timerIrq, clock);
      state.timerNext += TIMER_PERIOD;
    }
    const rasterDue = !model.rasterOff && clock >= model.irqClock + RASTER_LATENCY;
    if (rasterDue && state.kernal) {
      model.hung = true;
      model.hangClock = clock;
      return;
    }
    if (rasterDue || clock >= state.timerIrq) {
      if (state.kernal) model.clock += KERNAL_IRQ;
      else {
        const handler = model.handler;
        model.interrupt();
        if (handler !== 0x1c2d) state.timerMasked = true;
        // Only the bars IRQ, through the music, reads timer A's flags.
        if (handler !== 0x1cc9) {
          yield;
          continue;
        }
      }
      state.timerFlag = false;
      state.timerIrq = Infinity;
      yield;
      continue;
    }
    const local = clock % CYCLES_PER_FRAME;
    const line = Math.floor(local / CYCLES_PER_LINE), cycle = local % CYCLES_PER_LINE;
    model.clock++;
    if (line >= 51 && line <= 243 && (line & 7) === 3 && cycle >= 12 && cycle <= 54) continue;
    const tau = ++state.tau;
    while (next < script.length && script[next][0] <= tau) {
      const [, target, value] = script[next++];
      if (target < RAM) model.write(clock, target, value);
      else if (target < COLOR) model.poke(clock, target - RAM, value);
      else model.color(clock, 0xd800 + target - COLOR, value);
    }
    if (!state.cleared) {
      if (!(tau & 63)) yield;
      continue;
    }
    if (tau === STOP_TIMER) {
      const k = Math.floor((model.icrRead - TIMER_FIRST) / TIMER_PERIOD) + 1;
      state.timerFlag = TIMER_FIRST + k * TIMER_PERIOD <= clock;
    }
    if (tau === SILENCE) model.silenceClock = clock;
    // The pending timer flag interrupts after the next instruction.
    if (tau === ENABLE_TIMER) {
      state.timerMasked = false;
      if (state.timerFlag) state.timerIrq = clock + ENABLE_LATENCY;
    }
    if (tau === START_TIMER) state.timerNext = clock + TIMER_PERIOD + TIMER_LATENCY;
    if (tau === RESTORE) state.kernal = true;
    if (tau === RASTER_OFF) model.rasterOff = true;
    if (!(tau & 63)) yield;
  }
}
