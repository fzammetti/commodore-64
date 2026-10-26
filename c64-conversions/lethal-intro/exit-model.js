import { CYCLES_PER_FRAME, CYCLES_PER_LINE, FIRST_VISIBLE_LINE } from './timing.js';

const RAM = 0x10000, COLOR = 0x20000;
// A frame's picture runs from line 28 to line 27 of the next frame.
const WINDOW = FIRST_VISIBLE_LINE * CYCLES_PER_LINE;

// SPACE runs $1900: IOINIT, RESTOR and CINT, which set up the VIC-II (light blue border,
// blue screen, character ROM) and clear the screen from the bottom row up. The routine
// copied to $033c clears it again, then, with interrupts off, copies $2c00-$FFFF down to
// $0801 and RUNs the game. The game is not part of this reconstruction, so it ends on
// the blue screen the copy leaves, where Barbarian II would start. The writes and their
// cycles were traced in VICE (x64sc, NTSC), counted from the jump to $1900.
//
// Every write as [clock, target, value] from the intro frame's start, in clock order.
export function exitSchedule(timing, start) {
  const writes = timing.vic.map(([clock, register, value]) => [start + clock, register, value]);
  const clear = (deltas, base, value) => {
    let clock = start;
    deltas.forEach((delta, index) => {
      clock += delta;
      writes.push([clock, base + 999 - index, value]);
    });
  };
  clear(timing.screenClocks, RAM + 0x0400, timing.clearValue);
  clear(timing.colorClocks, COLOR, timing.clearColor);
  return writes.sort((a, b) => a[0] - b[0]);
}

export function applyWrite(state, [, target, value]) {
  if (target < RAM) state.vic[target] = value;
  else if (target < COLOR) state.memory[target - RAM] = value;
  else state.colorRam[target - COLOR] = value;
}

export class ExitModel {
  // Continues from the intro's last frame; its writes up to that frame's end are done.
  constructor(intro, timing) {
    this.memory = intro.memory.slice();
    this.colorRam = intro.colorRam.slice();
    this.vic = intro.vic.slice();
    this.view = {
      memory: this.memory.slice(), colorRam: this.colorRam.slice(), vic: this.vic.slice(), events: []
    };
    this.writes = intro.exitWrites;
    this.next = intro.exitNext;
    this.gameClock = intro.exitClock + timing.game;
    this.frame = 1;
    this.gameStarted = false;
  }

  step() {
    const base = this.frame * CYCLES_PER_FRAME, end = base + CYCLES_PER_FRAME + WINDOW;
    this.view.memory.set(this.memory);
    this.view.colorRam.set(this.colorRam);
    this.view.vic.set(this.vic);
    const events = [];
    while (this.next < this.writes.length && this.writes[this.next][0] < end) {
      const write = this.writes[this.next++];
      applyWrite(this, write);
      events.push([write[0] - base, write[1], write[2]]);
    }
    this.view.events = events;
    if (this.gameClock < end) this.gameStarted = true;
    this.frame++;
  }
}
