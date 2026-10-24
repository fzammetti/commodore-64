import { CYCLES_PER_FRAME, CYCLES_PER_LINE, FIRST_VISIBLE_LINE, RASTER_LINES } from './timing.js';
import { POINTER_REGISTER } from './display.js';

// Clocks count CPU cycles from line 28 of the field in which $5f43 starts the reveal.
// The cadence asset holds when each row copy finished on the recovered program with
// NTSC timing, badlines and the KERNAL's $4b95 CIA IRQ: about 24,038 cycles apart,
// as the $5f4a busy-wait loses time to the IRQ, and when $106b reaches JSR $1000.
const ROWS = 200;
// The KERNAL entry and $101f/$1045 reach STA $d011 in cycle 53..55 of the IRQ line;
// $10f9 starts 27 cycles later.
const IRQ_WRITE_CYCLE = 54;
const MOVE_DELAY = 27;

const lineClock = line => ((line - FIRST_VISIBLE_LINE + RASTER_LINES) % RASTER_LINES) * CYCLES_PER_LINE;

/** Native translation of WSOW Star Demo: the $5f40 picture reveal, then $106b's border scroller. */
export class DemoModel {
  constructor(memory, io, cadence) {
    this.memory = new Uint8Array(memory).slice();
    this.io = new Uint8Array(io).slice();
    if (this.memory.length !== 65536 || this.io.length !== 4096) {
      throw new Error('DemoModel requires 64 KiB RAM and 4 KiB I/O.');
    }
    if (cadence?.rows?.length !== ROWS || !Number.isInteger(cadence.main)) {
      throw new Error('DemoModel requires the 200-row reveal cadence.');
    }
    this.rowClocks = cadence.rows;
    this.frame = 0;
    this.rows = 0;
    this.current = new Uint8Array(POINTER_REGISTER + 8);
    this.current.set(this.io.subarray(0, 0x2f));
    this.current.set(this.memory.subarray(0x07f8, 0x0800), POINTER_REGISTER);
    this.registers = this.current.slice();
    this.events = [];
    // The vertical border flip-flop at line 28: set until $1045 first opens the lower border.
    this.verticalBorder = true;
    this.borderOpened = false;
    this.mainClock = cadence.main;
    this.musicStarted = false;
  }

  get phase() {
    return this.frame * CYCLES_PER_FRAME < this.mainClock ? 'reveal' : 'scroller';
  }

  write(clock, register, value) {
    value &= 255;
    this.events.push({ clock: clock - this.frame * CYCLES_PER_FRAME, register, value });
    this.current[register] = value;
    if (register < 0x2f) this.io[register] = value;
    else if (register >= POINTER_REGISTER) this.memory[0x07f8 + register - POINTER_REGISTER] = value;
  }

  // $5ebc/$5ecf/$5eff: copy one pixel row of all forty cells from the $6000 Koala
  // bitmap to $2000, advancing the self-modified operands at $5ed0/$5ed2/$5ed4.
  revealRow() {
    const m = this.memory;
    let source = m[0x5ed0] | (m[0x5ed2] << 8);
    let target = m[0x5ed0] | (m[0x5ed4] << 8);
    for (let cell = 0; cell < 40; cell++) {
      m[target] = m[source];
      source = (source + 8) & 0xffff;
      target = (target + 8) & 0xffff;
    }
    m[0x5ed0] = (m[0x5ed0] + 1) & 255;
    if ((m[0x5ed0] & 15) === 8) {
      const sum = (m[0x5ed0] & 0xf0) + 0x40;
      const step = sum > 255 ? 2 : 1;
      m[0x5ed0] = sum & 255;
      m[0x5ed2] = (m[0x5ed2] + step) & 255;
      m[0x5ed4] = (m[0x5ed4] + step) & 255;
    }
    this.rows++;
  }

  // $1075 and $1000: border sprites, colors and the raster IRQ. $d01a's latch is
  // already set by line 0, so the IRQ at $101f fires as soon as $101d clears I.
  startScroller(clock) {
    const m = this.memory;
    // Write clocks relative to JSR $1000, measured on the recovered program.
    for (let sprite = 0; sprite < 8; sprite++) this.write(clock - 624 + sprite * 12, POINTER_REGISTER + sprite, 0xff);
    this.write(clock - 528, 0x15, 0xff);
    this.write(clock - 522, 0x00, 0);
    this.write(clock - 518, 0x17, 0);
    for (let sprite = 0; sprite < 8; sprite++) this.write(clock - 505 + sprite * 14, sprite * 2 + 1, 0xfd);
    // $109e adds $2c up to X=$0e, so its last store lands in $d010 before $10b0 sets $c0.
    for (let x = 0; x < 16; x += 2) this.write(clock - 384 + x * 11, x + 2, this.current[x] + 0x2c);
    this.write(clock - 174, 0x10, 0xc0);
    for (let sprite = 0; sprite < 8; sprite++) this.write(clock - 165 + sprite * 12, 0x27 + sprite, 0xf3);
    this.write(clock - 69, 0x1c, 0xff);
    this.write(clock - 63, 0x25, 0xfc);
    this.write(clock - 57, 0x26, 0xf2);
    m[0x92] = 0x0e;
    m[0x93] = 0x12;
    m[0x94] = 1;
    m[0x95] = m[0x96] = 0;
    this.write(clock - 26, 0x20, 0);
    m[0x3fff] = 0xff;
    this.write(clock - 12, 0x17, 0);
    this.write(clock + 30, 0x11, this.current[0x11] & 0x50);
    this.irq(clock + 91, 0x3b);
    this.musicStarted = true;
  }

  irq(writeClock, d011) {
    this.write(writeClock, 0x11, d011);
    this.moveSprites(writeClock + MOVE_DELAY);
  }

  // $10f9: move each sprite left by one pixel. At X=0 the sprite wraps to 350
  // and takes the next character from ($92) as pointer char+$20, or $ff for a space.
  moveSprites(clock) {
    const m = this.memory, r = this.current;
    let c = clock + 7;
    let bit = 1;
    for (let x = 0; x < 16; x += 2) {
      c += 4;
      if (r[x]) c += 2;
      else {
        c += 3 + 2 + 3 + 4;
        if (r[0x10] & bit) {
          c += 2 + 2 + 2 + 3 + 4 + 4;
          this.write(c, 0x10, r[0x10] & ~bit);
          c += 3;
        } else {
          c += 3 + 3 + 4 + 4;
          this.write(c, 0x10, r[0x10] | bit);
          c += 2 + 5;
          this.write(c, x, 0x5e);
          c = this.nextCharacter(c, x >> 1);
        }
      }
      c += 7;
      this.write(c, x, r[x] - 1);
      // ASL, INX, INX, CPX, then BNE $10ff crosses from page $11 for an extra cycle.
      c += 5 + 4 + 2 + 4;
      bit <<= 1;
    }
    m[0xa3] = 0;
  }

  nextCharacter(clock, sprite) {
    const m = this.memory;
    let c = clock;
    for (;;) {
      c += 2 + 3 + 2 + 2 + 2 + 5 + 2;
      const pointer = m[0x92] | (m[0x93] << 8);
      const character = m[pointer];
      if (character) {
        c += 2 + 2;
        if (character === 0x20) {
          c += 2 + 2 + 5;
          this.write(c, POINTER_REGISTER + sprite, 0xff);
          c += 3;
        } else {
          c += 3 + 2 + 2 + 5;
          this.write(c, POINTER_REGISTER + sprite, character + 0x20);
        }
        m[0x92] = (m[0x92] + 1) & 255;
        c += 5 + 3;
        if (!m[0x92]) {
          m[0x93] = (m[0x93] + 1) & 255;
          c += 4;
        }
        return c + 4 + 2 + 3;
      }
      // A zero byte at $15bc restarts the message at $120e.
      m[0x92] = 0x0e;
      m[0x93] = 0x12;
      c += 3 + 10 + 4 + 2 + 3;
    }
  }

  skipReveal() {
    if (this.phase !== 'reveal') return;
    while (this.rows < ROWS) this.revealRow();
    this.mainClock = (this.frame + 1) * CYCLES_PER_FRAME + lineClock(54) + 45;
  }

  step() {
    const start = this.frame * CYCLES_PER_FRAME, end = start + CYCLES_PER_FRAME;
    this.registers = this.current.slice();
    this.verticalBorder = !this.borderOpened;
    this.events = [];
    while (this.rows < ROWS && this.rowClocks[this.rows] < end) this.revealRow();
    if (this.mainClock >= start && this.mainClock < end) this.startScroller(this.mainClock);
    if (this.mainClock < end) {
      for (const [line, d011] of [[248, 0x13], [0, 0x3b]]) {
        const clock = start + lineClock(line) + IRQ_WRITE_CYCLE;
        if (clock > this.mainClock + 91) {
          this.irq(clock, d011);
          if (line === 248) this.borderOpened = true;
        }
      }
    }
    this.events.sort((a, b) => a.clock - b.clock);
    this.frame++;
  }
}
