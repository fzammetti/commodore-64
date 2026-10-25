import { CYCLES_PER_FRAME } from './timing.js';

const RAM = 0x10000, COLOR = 0x20000;

// SPACE runs $0b00: IOINIT, RESTOR and CINT, which sets up the VIC-II (light blue border,
// blue screen, character ROM, sprites off) and clears the screen from the bottom row up
// over three frames. The $033c copy of $3600-$FFFF to $0801 follows, then BASIC's NEWSTT
// at $a7ae. The game that once followed the intro is not on this disk, so the copied RAM
// holds no program and BASIC stops at once: "READY." and the blinking KERNAL cursor.
// The writes and their cycles were traced in VICE (x64sc, NTSC), counted from the first
// frame after the intro's last IRQ; the cursor follows the KERNAL's 60 Hz CIA IRQ.
export class ExitModel {
  constructor(intro, timing) {
    this.memory = intro.memory.slice();
    this.colorRam = intro.colorRam.slice();
    this.vic = intro.vic.slice();
    this.view = {
      memory: this.memory.slice(), colorRam: this.colorRam.slice(), vic: this.vic.slice(), events: []
    };
    this.frame = 0;
    this.writes = this.schedule(timing);
    this.next = 0;
    this.cursor = timing.cursor;
    this.blinks = 0;
  }

  // Every traced write as [clock, target, value], in clock order.
  schedule(timing) {
    const writes = timing.vic.map(([clock, register, value]) => [clock, register, value]);
    const clear = (deltas, base, value) => {
      let clock = 0;
      deltas.forEach((delta, index) => {
        clock += delta;
        writes.push([clock, base + 999 - index, value]);
      });
    };
    clear(timing.screenClocks, RAM + 0x0400, timing.clearValue);
    clear(timing.colorClocks, COLOR, timing.clearColor);
    writes.push(...timing.text);
    return writes.sort((a, b) => a[0] - b[0]);
  }

  apply([, target, value]) {
    if (target < RAM) this.vic[target] = value;
    else if (target < COLOR) this.memory[target - RAM] = value;
    else this.colorRam[target - COLOR] = value;
  }

  step() {
    const base = this.frame * CYCLES_PER_FRAME, end = base + CYCLES_PER_FRAME;
    this.view.memory.set(this.memory);
    this.view.colorRam.set(this.colorRam);
    this.view.vic.set(this.vic);
    const events = [];
    while (this.next < this.writes.length && this.writes[this.next][0] < end) {
      const write = this.writes[this.next++];
      this.apply(write);
      events.push([write[0] - base, write[1], write[2]]);
    }
    // The cursor shows (reverse space) and hides every 20th KERNAL IRQ.
    for (;;) {
      const clock = this.cursor.first + this.blinks * this.cursor.period;
      if (clock >= end) break;
      const write = [clock, RAM + this.cursor.address, this.blinks % 2 ? 0x20 : 0xa0];
      this.apply(write);
      events.push([clock - base, write[1], write[2]]);
      this.blinks++;
    }
    this.view.events = events;
    this.frame++;
  }
}
