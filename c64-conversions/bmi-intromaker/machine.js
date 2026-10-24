import { KernalScreen } from './kernal-screen.js';
import { CYCLES_PER_FRAME } from './timing.js';

// NTSC CIA 1 timer A ($4295 + 1 cycles) drives the KERNAL's 60 Hz jiffy IRQ.
export const KERNAL_JIFFY = 0x4295 + 1;

/**
 * A C64 memory image plus the KERNAL and BASIC services the BMI tools call. A program
 * runs as a generator: it yields 'frame' while it waits, and `cycles(n)` spends the frame
 * budget so printing and busy loops keep their original speed. step() runs one NTSC frame.
 */
export class Machine {
  constructor(ram, io) {
    this.memory = new Uint8Array(ram).slice();
    this.io = new Uint8Array(io).slice();
    this.kernal = new KernalScreen(this);
    this.rasterWrites = [];
    this.sidWrites = [];
    this.budget = 0;
    this.cycle = 0;
    this.jiffyCycles = KERNAL_JIFFY;
    this.jiffyClock = 0;
    this.interrupts = true;
    this.keyQueue = [];
    this.keyHeld = false;
    this.frame = 0;
    this.program = null;
  }

  start(program) {
    this.program = program;
  }

  // Queue a PETSCII key; the KERNAL keyboard scan delivers one key per jiffy.
  pressKey(code) {
    if (this.keyQueue.length < 64) this.keyQueue.push(code);
  }

  jiffy() {
    const m = this.memory;
    m[0xa2] = (m[0xa2] + 1) & 255;
    if (!m[0xa2]) {
      m[0xa1] = (m[0xa1] + 1) & 255;
      if (!m[0xa1]) m[0xa0] = (m[0xa0] + 1) & 255;
    }
    this.kernal.blink();
    m[0xc5] = this.keyHeld ? 0x3c : 0x40;
    if (this.keyQueue.length && m[0xc6] < m[0x289]) {
      m[0x277 + m[0xc6]] = this.keyQueue.shift();
      m[0xc6]++;
    }
  }

  step() {
    this.frame++;
    this.rasterWrites.length = 0;
    this.frameStart = this.cycle;
    // The display starts each frame from the registers as they were before this frame.
    this.frameRegisters = this.io.slice(0, 0x2f);
    this.budget = Math.min(this.budget + CYCLES_PER_FRAME, CYCLES_PER_FRAME * 2);
    this.nextJiffy ??= this.cycle + this.jiffyCycles;
    while (this.program && this.budget > 0) {
      const result = this.program.next();
      if (result.done) {
        this.program = null;
        break;
      }
      if (result.value === 'frame') {
        this.cycle += Math.max(0, this.budget);
        this.budget = 0;
        break;
      }
    }
    this.runJiffies();
  }

  runJiffies() {
    while (this.cycle >= this.nextJiffy) {
      this.nextJiffy += this.jiffyCycles;
      if (this.interrupts) this.jiffy();
    }
  }

  * cycles(count) {
    this.budget -= count;
    this.cycle += count;
    while (this.budget <= 0) {
      yield 'cycles';
      this.runJiffies();
    }
  }

  // Changes to $D418 and the voices are timed to the cycle for the audio worklet.
  sid(register, value) {
    this.io[0x400 + register] = value;
    this.sidWrites.push({ cycle: this.cycle, register, value });
  }

  // $FFD2 to the screen. A clear screen costs as much as on the C64.
  * chrout(code, cost = 200) {
    this.kernal.print(code);
    yield* this.cycles(code === 0x93 ? 40758 : cost);
  }

  // BASIC $AB1E: print a zero-terminated string from memory. Like the original it
  // returns $F2 in A when the string ends with RETURN.
  * strout(address) {
    let a = 0;
    for (let at = address; this.memory[at]; at++) {
      a = this.memory[at];
      yield* this.chrout(a, 380);
      if (a === 0x0d) a = 0xf2;
    }
    return a;
  }

  // BASIC $BDCD: an unsigned 16-bit number without a leading space.
  * linprt(value) {
    for (const digit of String(value)) yield* this.chrout(digit.charCodeAt(0), 900);
  }

  // $E5B4: take the first key from the keyboard buffer.
  takeKey() {
    const m = this.memory;
    const key = m[0x277];
    for (let x = 0; x < m[0xc6]; x++) m[0x277 + x] = m[0x278 + x];
    m[0xc6]--;
    return key;
  }

  // $FFE4 from the keyboard: 0 when the buffer is empty.
  * getin() {
    yield* this.cycles(40);
    if (!this.memory[0xc6]) return 0;
    return this.takeKey();
  }

  // Wait in a GETIN loop until a key arrives.
  * waitKey() {
    for (;;) {
      const key = yield* this.getin();
      if (key) return key;
      yield 'frame';
    }
  }

  // $E632 with an empty input line: the full-screen editor until RETURN.
  * inputLine() {
    const m = this.memory, kernal = this.kernal;
    for (;;) {
      m[0xcc] = m[0xc6];
      m[0x292] = m[0xc6];
      if (!m[0xc6]) {
        this.waiting = true;
        yield 'frame';
        continue;
      }
      kernal.hideCursor();
      const key = this.takeKey();
      if (key === 0x83) {
        // SHIFT+RUN/STOP types LOAD and RUN.
        const text = [0x4c, 0x4f, 0x41, 0x44, 0x0d, 0x52, 0x55, 0x4e, 0x0d];
        text.forEach((code, index) => { m[0x277 + index] = code; });
        m[0xc6] = text.length;
        continue;
      }
      if (key === 0x0d) {
        this.waiting = false;
        return kernal.readLine();
      }
      yield* this.chrout(key, 250);
    }
  }

  // $F157: CHRIN from the keyboard.
  * chrin() {
    const m = this.memory;
    m[0xca] = m[0xd3];
    m[0xc9] = m[0xd6];
    if (!m[0xd0]) return yield* this.inputLine();
    yield* this.cycles(120);
    return this.kernal.readCharacter();
  }

  // BASIC $A560 INLIN: read a line into the buffer at $0200, then print RETURN.
  * inlin() {
    const m = this.memory;
    let x = 0;
    for (;;) {
      const a = yield* this.chrin();
      if (a === 0x0d) break;
      m[0x200 + x] = a;
      x++;
      if (x >= 0x59) break;
    }
    m[0x200 + x] = 0;
    yield* this.chrout(0x0d);
    return x;
  }
}
