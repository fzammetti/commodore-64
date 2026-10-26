import { CYCLES_PER_FRAME, CYCLES_PER_LINE } from './timing.js';

const RAM = 0x10000, COLOR = 0x20000;

// A key leaves the intro through $2550: IOINIT, RESTOR and CINT, then border and screen
// black, PRINT CHR$(147), and the routine copied to $033c that clears the screen once
// more, copies $2600-$FFFF down to $0801 and RUNs the game. The raster IRQs keep running
// all the while, until RESTOR hands the IRQ vector back to the KERNAL and CINT switches
// the raster IRQ off.
//
// The KERNAL's part runs on the main thread, so it only advances in the cycles the IRQs
// and the badlines leave it. Its stores are given here in those cycles as VICE traced
// them (x64sc, NTSC), counted from the JSR $FDA3 at $2550. IOINIT stops timer A,
// sets the SID's volume to zero, enables timer A's IRQ and starts the timer again;
// RESTOR sets $0315 to $EA first, then $0314; CINT writes the VIC-II's 47 registers
// from $d02e down, 14 cycles apart, from the KERNAL's table at $ECB9 (its last byte is
// code), and clears the screen in light blue.
const STOP_TIMER = 25, SILENCE = 51, ENABLE_TIMER = 107, START_TIMER = 119;
const RESTORE = 990, VIC_INIT = 1069, BLUE_CLEAR = 2349;
const VIC_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x9b, 0x37, 0, 0, 0, 0x08, 0, 0x14, 0x0f,
  0, 0, 0, 0, 0, 0, 0x0e, 0x06, 0x01, 0x02, 0x03, 0x04, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05,
  0x06, 0x07, 0x4c
];
const RASTER_OFF = VIC_INIT + (0x2e - 0x1a) * 14 - 1;
// 107 cycles after the clear's last store CINT starts waiting for raster line 256: a
// loop of LDA $D012 (read in its fourth cycle) and BNE, 7 cycles a round. Two cycles
// after the read that sees line 256 it goes on, at $FF63.
const WAIT = 107, WAIT_ROUND = 7, WAIT_READ = 3, WAIT_LINE = 256;
// From $FF63: timer A's IRQ on and the timer restarted, back in the intro border and
// screen black, and the second clear, in black. Nothing visible changes after that;
// the game starts a fixed time later (VICE: 1,039,650 to 1,039,871 cycles).
const ENABLE_AGAIN = 40, START_AGAIN = 52, BORDER_BLACK = 77, SCREEN_BLACK = 81;
const BLACK_CLEAR = 782, GAME = 1039760;

// CIA 1's timer A, the KERNAL's 60 Hz IRQ, keeps running under the intro with its IRQ
// masked, and the bottom IRQ reads its flags every frame. It underflows at clock 8227
// and every 17046 cycles after. If it has underflowed since that read, the IRQ IOINIT
// enables fires at once, and the intro's handlers run one after the other until the
// bottom handler reads the flags; every handler masks timer A again.
const TIMER_FIRST = 8227, TIMER_PERIOD = 17046;
// After RESTOR an IRQ runs the KERNAL's handler, 219 cycles, starting 7 cycles after
// the timer underflows. The main thread's instruction delays a raster IRQ about 5.
const KERNAL_IRQ = 219, TIMER_LATENCY = 7, RASTER_LATENCY = 5, ENABLE_LATENCY = 6;
const BOTTOM = 0x1946;

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

// The main thread's writes as [cycle, target, value], in order: up to CINT's wait, and
// from $FF63.
const BEFORE = [
  ...VIC_TABLE.map((value, register) => [VIC_INIT + (0x2e - register) * 14, register, value]),
  ...clearSchedule(BLUE_CLEAR, 14)
].sort((a, b) => a[0] - b[0]);
const AFTER = [
  [BORDER_BLACK, 0x20, 0], [SCREEN_BLACK, 0x21, 0], ...clearSchedule(BLACK_CLEAR, 0)
];
const BLUE_END = BEFORE[BEFORE.length - 1][0];

// The main thread from $2550 to the game, on the model's IRQs. A raster IRQ that comes
// between RESTOR and CINT goes to the KERNAL, which never acknowledges it: the C64 then
// runs that IRQ for ever and the picture freezes.
export function* exitThread(model) {
  const state = {
    tau: 0, phase: 0, kernal: false,
    timerFlag: false, timerIrq: Infinity, timerMasked: true, timerNext: Infinity
  };
  yield* scripted(model, state, BEFORE, BLUE_END + WAIT);
  if (model.hung) return;
  // CINT's wait for line 256.
  for (;;) {
    yield* scripted(model, state, [], state.tau + WAIT_READ + 1);
    if (model.hung) return;
    const line = Math.floor(((model.clock - 1) % CYCLES_PER_FRAME) / CYCLES_PER_LINE);
    if (line === WAIT_LINE) break;
    yield* scripted(model, state, [], state.tau + WAIT_ROUND - WAIT_READ - 1);
  }
  yield* scripted(model, state, [], state.tau + 2);
  // From $FF63, counting again from 0.
  state.tau = 0;
  state.phase = 1;
  const release = model.clock;
  yield* scripted(model, state, AFTER, AFTER[AFTER.length - 1][0]);
  model.gameClock = release + GAME;
}

// The main thread, cycle by cycle, up to `until` of its cycles. The IRQs come about 5
// cycles after their raster line, when the instruction ends.
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
      if (state.kernal) {
        model.clock += KERNAL_IRQ;
        state.timerFlag = false;
        state.timerIrq = Infinity;
      } else {
        // The intro's handlers mask timer A; only the bottom one, through the KERNAL,
        // reads (and clears) its flags. Until then the CIA keeps the IRQ line low.
        const handler = model.handler;
        model.interrupt();
        state.timerMasked = true;
        if (handler === BOTTOM) {
          state.timerFlag = false;
          state.timerIrq = Infinity;
        }
      }
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
    if (!state.phase) {
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
    } else {
      if (tau === ENABLE_AGAIN) {
        state.timerMasked = false;
        if (state.timerFlag) state.timerIrq = clock + ENABLE_LATENCY;
      }
      if (tau === START_AGAIN) state.timerNext = clock + TIMER_PERIOD + TIMER_LATENCY;
    }
    if (!(tau & 63)) yield;
  }
}
