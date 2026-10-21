import { CYCLES_PER_FRAME } from './timing.js';
import { INTERLUDE_CAPTURE_CYCLES, INTERLUDE_CAPTURE_EVENTS } from './interlude-cadence.js';

// Includes the caller's JSR and the subroutine's RTS. The inner X countdown
// wraps from zero, so it executes 256 times; Y includes its final zero pass.
export const INTERLUDE_WAIT_CYCLES = 290156;
export const INTERLUDE_FADE_CYCLES = 30668;
export const INTERLUDE_HOLD_CYCLES = 922658;

// Preserve the shipped branch at $225F: it jumps into the next fade loop,
// skipping the seventh string at $24BF, its clear, its wait, and its copy.
export const INTERLUDE_MESSAGES = Object.freeze([0, 1, 2, 3, 4, 5, 7]);

function timeline() {
  const events = [];
  let cycles = 0;
  const emit = (type, detail = {}) => events.push({ cycles, type, ...detail });
  for (const message of INTERLUDE_MESSAGES) {
    emit('phase', { phase: 'wait', message });
    cycles += 483; // LDX/LDA and forty indexed color stores.
    emit('color', { color: 0 });
    cycles += INTERLUDE_WAIT_CYCLES * 5;
    const source = 0x23c3 + message * 42;
    const sourceCrossings = Math.max(0, (source & 255) + 40 - 256);
    // The last copy's BNE is at $22FE and crosses back from $2300.
    cycles += 641 + sourceCrossings + (message === 7 ? 39 : 0);
    emit('text', { source });
    emit('phase', { phase: 'fade', message });
    for (let level = 0; level < 9; level++) {
      cycles += 489; // LDX absolute, table LDA, LDX #0 and forty color stores.
      emit('palette', { level });
      cycles += 6;
      emit('counter', { value: level + 1 });
      cycles += 4 + 2 + (level === 8 ? 3 : 2);
      if (message === 4 && level === 8) cycles++; // Taken BEQ $21FB -> $2203 crosses a page.
      if (level < 8) cycles += INTERLUDE_FADE_CYCLES + 3;
    }
    emit('phase', { phase: 'hold', message });
    cycles += INTERLUDE_HOLD_CYCLES * 6;
    if (message !== 7) {
      cycles += 6; // LDA #0; STA $2032.
      emit('counter', { value: 0 });
    }
  }
  emit('phase', { phase: 'final-wait', message: 7 });
  cycles += INTERLUDE_WAIT_CYCLES * 2 + INTERLUDE_HOLD_CYCLES * 2;
  // $233E programs the sustained SID tone with JSR $2600 before JMP $C000.
  emit('complete');
  return { events, cycles };
}

const TIMELINE = timeline();
export const INTERLUDE_TOTAL_CYCLES = TIMELINE.cycles;
export const INTERLUDE_MEASURED_TOTAL_CYCLES = INTERLUDE_CAPTURE_CYCLES;

function capture(input, size, name) {
  const bytes = new Uint8Array(input);
  if (bytes.length !== size) throw new Error(`${name} must contain ${size} bytes.`);
  return bytes.slice();
}

// Playback uses captured NTSC event clocks, including IRQ and VIC work. The
// original instruction-only timeline remains selectable for CPU parity checks.
// Whole-row copies are committed together when their loop completes.
export class InterludeModel {
  constructor(memory, io, { timing = 'captured' } = {}) {
    this.memory = capture(memory, 65536, 'RAM');
    this.io = capture(io, 4096, 'I/O');
    this.frame = 0;
    this.cycles = 0;
    this.event = 0;
    this.message = 0;
    this.phase = 'wait';
    this.complete = false;
    this.timeline = timing === 'instruction' ? TIMELINE.events : INTERLUDE_CAPTURE_EVENTS;
    this.totalCycles = timing === 'instruction' ? TIMELINE.cycles : INTERLUDE_CAPTURE_CYCLES;
    this.timingMode = timing;
    this.memory[0x2032] = 0;
    this.applyEvents();
  }

  applyEvents() {
    while (this.event < this.timeline.length && this.timeline[this.event].cycles <= this.cycles) {
      const event = this.timeline[this.event++];
      if (event.type === 'phase') {
        this.phase = event.phase;
        this.message = event.message;
      } else if (event.type === 'text') {
        this.memory.copyWithin(0x05e0, event.source, event.source + 40);
      } else if (event.type === 'color') {
        this.io.fill(event.color, 0x9e0, 0xa08);
      } else if (event.type === 'palette') {
        this.io.fill(this.memory[0x2033 + event.level], 0x9e0, 0xa08);
      } else if (event.type === 'counter') {
        this.memory[0x2032] = event.value;
      } else if (event.type === 'complete') {
        this.phase = 'complete';
        this.complete = true;
      }
    }
  }

  step() {
    if (this.complete) return;
    this.frame++;
    this.cycles += CYCLES_PER_FRAME;
    this.applyEvents();
  }
}
