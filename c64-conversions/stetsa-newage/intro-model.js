import { CYCLES_PER_FRAME } from './timing.js';
import { CREDITS_CAPTURE_CYCLES, CREDITS_CAPTURE_EVENTS } from './credits-cadence.js';

const FADE_IN = [0, 11, 12, 15, 1];
const FADE_OUT = [1, 15, 12, 11, 0];

// Counts include the caller's JSR. The Y loops execute 25 / 185 times, including Y=0.
export const SHORT_DELAY_CYCLES = 44909;
export const LONG_DELAY_CYCLES = 332109;
export const HOLD_CYCLES = LONG_DELAY_CYCLES * 9;

function capture(input, size, name) {
  const bytes = new Uint8Array(input);
  if (bytes.length !== size) throw new Error(`${name} must contain ${size} bytes.`);
  return bytes.slice();
}

export class WelcomeModel {
  constructor(memory, io) {
    this.memory = capture(memory, 65536, 'RAM');
    this.io = capture(io, 4096, 'I/O');
    this.frame = 0;
  }

  // The first unpacked page uses the normal $EA31 system IRQ and has no animated graphics.
  step() { this.frame++; }
}

function fadeEvents(start, colors) {
  const events = [];
  let cycles = start;
  for (let band = 0; band < 12; band++) {
    cycles += 2; // LDY #0.
    for (let level = 0; level < 5; level++) {
      cycles += 6; // LDA $3042,Y; LDX #0.
      events.push({ cycles, type: 'band', band, color: colors[level] });
      // Forty pairs of absolute indexed stores, INX, CPX, and the taken/final branches.
      cycles += 679 + SHORT_DELAY_CYCLES + 4 + (level === 4 ? 2 : 3);
    }
  }
  return { events, end: cycles + 6 }; // RTS at $31a4.
}

const fadeIn = fadeEvents(0, FADE_IN);
export const FADE_CYCLES = fadeIn.end;
const holdEnd = FADE_CYCLES + HOLD_CYCLES;
const fadeOut = fadeEvents(holdEnd, FADE_OUT);
export const CREDIT_PAGE_CYCLES = fadeOut.end;
export const CREDIT_MEASURED_LOOP_CYCLES = CREDITS_CAPTURE_CYCLES;
const EVENTS = [
  { cycles: 0, type: 'phase', phase: 'fade-in', colors: FADE_IN },
  ...fadeIn.events,
  { cycles: FADE_CYCLES, type: 'phase', phase: 'hold' },
  { cycles: holdEnd, type: 'phase', phase: 'fade-out', colors: FADE_OUT },
  ...fadeOut.events
];

/**
 * Native translation of $3000-$3368: four recovered double-height credit screens,
 * fading successive pairs of rows with the exact five-entry gray tables.
 * Playback uses one measured four-page NTSC cycle, including music IRQ and VIC
 * work. Original instruction-only timing remains selectable for parity checks.
 * Later CIA/music/video phase can vary slightly from the captured cycle.
 */
export class CreditsModel {
  constructor(memory, io, { timing = 'captured' } = {}) {
    this.memory = capture(memory, 65536, 'RAM');
    this.io = capture(io, 4096, 'I/O');
    this.frame = 0;
    this.credit = 0;
    this.loops = 0;
    this.pageCycles = 0;
    this.event = 0;
    this.timingMode = timing;
    this.captureCycles = 0;
    this.captureEvent = 0;
    this.capturePageStart = 0;
    this.io[0x20] = 0;
    this.io[0x21] = 0;
    this.io[0x15] = 0;
    this.io[0x11] = 0x1b;
    this.io[0x16] = 0xc8;
    this.io[0xd00] = (this.io[0xd00] & 0xfc) | 3;
    this.beginPage();
  }

  beginPage() {
    // The supplied snapshot is already on screen two. Entry $3033 selects screen one.
    // Low D018 bit 0 reads back as one, hence $83/$93/$a3/$b3 in monitor captures.
    this.io[0x18] = 0x83 + this.credit * 0x10;
    this.io.fill(0, 0x800, 0xbe8);
    this.event = 0;
    this.applyEvents();
  }

  applyEvents() {
    while (this.event < EVENTS.length && EVENTS[this.event].cycles <= this.pageCycles) {
      const event = EVENTS[this.event++];
      if (event.type === 'phase') {
        this.phase = event.phase;
        if (event.colors) this.memory.set(event.colors, 0x3042);
      } else {
        const begin = 0x800 + event.band * 80;
        this.io.fill(event.color, begin, begin + 80);
      }
    }
  }

  step() {
    this.frame++;
    if (this.timingMode === 'captured') {
      this.captureCycles += CYCLES_PER_FRAME;
      this.applyCapturedEvents();
      while (this.captureCycles >= CREDITS_CAPTURE_CYCLES) {
        this.captureCycles -= CREDITS_CAPTURE_CYCLES;
        this.captureEvent = 0;
        this.capturePageStart = 0;
        this.loops++;
        this.applyCapturedEvents();
      }
      this.pageCycles = this.captureCycles - this.capturePageStart;
      return;
    }
    this.pageCycles += CYCLES_PER_FRAME;
    while (this.pageCycles >= CREDIT_PAGE_CYCLES) {
      this.pageCycles -= CREDIT_PAGE_CYCLES;
      this.credit = (this.credit + 1) & 3;
      if (this.credit === 0) this.loops++;
      this.beginPage();
    }
    this.applyEvents();
  }

  applyCapturedEvents() {
    while (this.captureEvent < CREDITS_CAPTURE_EVENTS.length &&
      CREDITS_CAPTURE_EVENTS[this.captureEvent].cycles <= this.captureCycles) {
      const event = CREDITS_CAPTURE_EVENTS[this.captureEvent++];
      if (event.type === 'page') {
        this.credit = event.credit;
        this.capturePageStart = event.cycles;
        this.pageCycles = 0;
        this.beginPage();
      } else if (event.type === 'phase') {
        this.phase = event.phase;
        if (event.colors) this.memory.set(event.colors, 0x3042);
      } else if (event.type === 'band') {
        const begin = 0x800 + event.band * 80;
        this.io.fill(event.color, begin, begin + 80);
      }
    }
  }
}
