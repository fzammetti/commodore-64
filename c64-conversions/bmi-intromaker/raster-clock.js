import { CYCLES_PER_LINE, RASTER_LINES } from './timing.js';

// Counts 6502 cycles through a raster IRQ handler so its VIC writes land on the same
// line and cycle as on an NTSC C64. Bad lines stall the CPU from cycle 12 to cycle 55;
// like the analysis emulator, the stall is applied at instruction granularity.
export class RasterClock {
  constructor(events, vicControl) {
    this.events = events;
    this.vicControl = vicControl;
    this.clock = 0;
    this.stolen = -1;
  }

  at(line, cycle) {
    this.clock = line * CYCLES_PER_LINE + cycle;
    return this;
  }

  badLine(line) {
    const control = this.vicControl();
    return line >= 0x30 && line <= 0xf7 && (control & 16) && (line & 7) === (control & 7);
  }

  // One instruction of `cycles` cycles; `write` records a VIC store on its final cycle.
  spend(cycles, register, value) {
    let line = Math.floor(this.clock / CYCLES_PER_LINE);
    let cycle = this.clock - line * CYCLES_PER_LINE;
    if (this.badLine(line % RASTER_LINES) && this.stolen !== line && cycle >= 12 && cycle < 55) {
      this.clock += 55 - cycle;
      this.stolen = line;
    }
    const begin = this.clock;
    this.clock += cycles;
    if (register !== undefined) this.events.push({ clock: this.clock - 1, register, value });
    line = Math.floor(this.clock / CYCLES_PER_LINE);
    cycle = this.clock - line * CYCLES_PER_LINE;
    if (this.badLine(line % RASTER_LINES) && this.stolen !== line && cycle >= 12
      && begin - line * CYCLES_PER_LINE < 12) {
      this.clock += 43;
      this.stolen = line;
    }
  }

  // JSR $18B5 with X loaded: DEX/BPL busy loop, NOP, RTS.
  delay(x) {
    this.spend(6);
    for (let index = 0; index < x; index++) {
      this.spend(2);
      this.spend(3);
    }
    this.spend(2);
    this.spend(2);
    this.spend(2);
    this.spend(6);
  }

  get line() {
    return Math.floor(this.clock / CYCLES_PER_LINE);
  }
}
