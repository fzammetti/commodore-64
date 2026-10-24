import { Machine } from './machine.js';
import { CYCLES_PER_FRAME } from './timing.js';

// Strings of the relocated compactor (zero-terminated, printed with BASIC's STROUT).
const LOW_MEM = 0x0f98, SKIP = 0x0fe3, LINKER = 0x0fa9, FILENAME = 0x0fd8, COMPACTING = 0x0fcb;
const SYS_ADDRESS = 0x0f87, LOADING = 0x0d8e, SAVING = 0x0df7, IO_ERROR = 0x0d7b;
const LENGTH = 0x0e46, BYTES = 0x0e58, BLOCKS = 0x0e60;
// The KERNAL's "\rSAVING " message, shown because $9D holds STROUT's $F2.
const KERNAL_SAVING = [0x0d, 0x53, 0x41, 0x56, 0x49, 0x4e, 0x47, 0x20];
// $0C74: the chord that sounds once the title closes and never stops.
const CHORD = [0x30, 0x04, 0x00, 0x00, 0x21, 0x0f, 0xfa, 0x28, 0x04, 0x00, 0x00, 0x21, 0x0f, 0xfa,
  0x18, 0x02, 0x00, 0x00, 0x21, 0x0f, 0xfa, 0x00, 0x10, 0xff, 0x3f, 0x6d];
// Disk transfers run at roughly 15 KB/s instead of the 1541's 400 bytes per second.
const DISK_CYCLES_PER_BYTE = 64;
// Estimated cost of the compressor per source byte, for its border flashing.
const PACK_CYCLES_PER_BYTE = 260;

/**
 * Native translation of Compactor V4/S by E.C.A Productions, "the improved version of
 * W.H.O's C. V3.23", which the BMI editor starts as its linker. The model keeps the
 * relocated program's memory, so the decruncher it saves is the original's, patched the
 * same way, and the packed data is byte-for-byte what the C64 produces.
 */
export class CompactorModel extends Machine {
  constructor(ram, io, disk, hooks = {}) {
    super(ram, io);
    this.disk = disk;
    this.hooks = hooks;
    this.state = 'title';
    this.start(this.main());
  }

  * main() {
    yield* this.title();
    this.relocate();
    for (;;) yield* this.compactor();
  }

  // $0A00-$0B12: the typewriter title in the custom font at $0800.
  * title() {
    const m = this.memory;
    m.copyWithin(0x0800, 0x0a2a, 0x0a4a);
    this.io[0x20] = 0;
    this.io[0x21] = 0;
    this.io[0x18] = 0x12;
    m[0x291] = 0x80;
    yield* this.chrout(0x05);
    let base = 0x0b15, patched = false;
    typing: for (;;) {
      m[0xff] = 0;
      for (;;) {
        this.sid(0x18, 0x0f);
        m[0xff] = (m[0xff] + 1) & 255;
        const a = m[base + m[0xff]];
        if (a === 0) {
          if (patched) break typing;
          // $0A80: the second half follows the first terminator, which becomes a space.
          m[0x0c14] = 0x20;
          base += 0x100;
          patched = true;
          continue typing;
        }
        if (a === 0x0d) yield* this.chrout(0x20);
        yield* this.chrout(a);
        yield* this.cycles(2571);
        // The volume drops to 0 between characters: the click of the typewriter.
        this.sid(0x18, 0);
        yield* this.chrout(0x40);
        yield* this.chrout(0x9d);
        yield* this.cycles(5139);
        if (this.memory[0xc5] !== 0x40) break typing;
      }
    }
    this.state = 'title-wait';
    yield* this.chrout(0x20);
    this.sid(0x18, 0);
    while (this.memory[0xc5] === 0x40) yield 'frame';
    yield* this.chrout(0x93);
    this.io[0x18] = 0x15;
    for (let x = 0x1a; x > 0; x--) {
      this.sid(x - 1, 0);
      this.sid(x - 1, CHORD[x - 1]);
    }
  }

  // $1000: move the program to $02B0, $0300, $0800 and $0900-$0FFF.
  relocate() {
    const m = this.memory;
    m.copyWithin(0x02b0, 0x10b0, 0x11b0);
    m.copyWithin(0x0300, 0x1100, 0x1200);
    m.copyWithin(0x0800, 0x1200, 0x1300);
    m.copyWithin(0x0900, 0x1300, 0x2000);
  }

  // $02CF onward.
  * compactor() {
    const m = this.memory;
    this.state = 'prompt';
    // $02CF: CIA 1 timer A latch high byte $4D slows the jiffy IRQ to about 51 Hz.
    this.jiffyCycles = 0x4d95 + 1;
    yield* this.cycles(1280);
    for (let x = 0; x < 0x38; x++) yield* this.chrout(m[0x0387 + x]);
    // $090A: clear $1000-$FFFF with the ROMs switched out.
    this.interrupts = false;
    m.fill(0, 0x1000);
    m[0x0905] = m[0x0906] = m[0x0909] = 0;
    yield* this.cycles(530000);
    this.interrupts = true;
    let low;
    do low = yield* this.hexPrompt(LOW_MEM); while (low === null);
    m[0x0903] = m[0x0842] = low & 255;
    m[0x0904] = m[0x0843] = low >> 8;
    const skip = yield* this.hexPrompt(SKIP);
    if (skip !== null) {
      m[0x0908] = skip >> 8;
      m[0x0907] = 0xff;
      m[0x03f5] = ((skip >> 8) + 0x0f) & 255;
      m[0x08de] = 0x20;
    } else {
      m[0x0907] = 0;
      m[0x08de] = 0x2c;
    }
    yield* this.link();
    yield* this.programLength();
    yield* this.strout(COMPACTING);
    yield* this.chrout(0xd4);
    yield* this.moveToTop();
    yield* this.chrout(0xc3);
    yield* this.compress();
    yield* this.chrout(0x0d);
    this.patchDecruncher();
    yield* this.programLength();
    const sys = yield* this.hexPrompt(SYS_ADDRESS);
    m[0x08e7] = sys === null ? 0x59 : sys & 255;
    m[0x08e8] = sys === null ? 0xa6 : sys >> 8;
    m.copyWithin(0x1000, 0x0800, 0x0900);
    for (let y = 0x38; y >= 0; y--) m[0x1100 + y] = m[0x03c0 + y];
    // $0A29: save under as many names as wanted; an empty name restarts the compactor.
    for (;;) {
      this.state = 'save-name';
      yield* this.strout(FILENAME);
      yield* this.input();
      if (m[0x0e96] === 0x24) {
        yield* this.directory();
        continue;
      }
      if (!m[0x0e95]) return;
      yield* this.save();
    }
  }

  // $0F48: print a prompt and read exactly four hex digits; null if the line is empty.
  * hexPrompt(prompt) {
    const m = this.memory;
    yield* this.strout(prompt);
    for (;;) {
      const length = yield* this.input();
      if (!length) return null;
      if (length === 4) return this.parseHex(0x0e95);
    }
  }

  // $0F57: two hex bytes from the four characters after `base`.
  parseHex(base) {
    const m = this.memory;
    const nibble = at => {
      let a = m[at];
      if (a >= 0x3a) a = (a - 7) & 255;
      return a & 15;
    };
    return (nibble(base + 1) << 12) | (nibble(base + 2) << 8) | (nibble(base + 3) << 4) | nibble(base + 4);
  }

  // $0E6B: read a line, keep up to 16 characters at $0E96 and check for ",XXXX".
  * input() {
    const m = this.memory;
    m[0xc6] = 0;
    yield* this.inlin();
    m[0x0e95] = 0;
    for (let y = 0; m[0x200 + y] && m[0x0e95] !== 0x10; y++) {
      m[0x0e95]++;
      m[0x0e95 + m[0x0e95]] = m[0x200 + y];
    }
    // $0334: a comma selects the load address in the four characters after it.
    let x = 0;
    while (x < 0x16 && m[0x200 + x] !== 0x2c) x++;
    if (x < 0x16) {
      for (let y = 0; y < 4; y++) m[0x07e8 + y] = m[0x200 + x + 1 + y];
      const address = this.parseHex(0x07e7);
      m[0x02c7] = address >> 8;
      m[0x02cb] = address & 255;
      m[0x02c5] = 0xea;
    } else {
      m[0x02c5] = 0x60;
    }
    for (let y = 0x30; y > 0; y--) m[0x200 + y] = 0;
    return m[0x0e95];
  }

  nameBytes() {
    return this.memory.subarray(0x0e96, 0x0e96 + this.memory[0x0e95]);
  }

  // $0A53: the linker loop. '$' lists the disk, '@' compacts once something is loaded.
  * link() {
    const m = this.memory;
    yield* this.strout(LINKER);
    for (;;) {
      this.state = 'link';
      yield* this.strout(FILENAME);
      yield* this.input();
      if (m[0x0e96] === 0x24) {
        yield* this.directory();
        continue;
      }
      if (m[0x0e96] === 0x40) {
        if (m[0x0909]) return;
        continue;
      }
      yield* this.load();
    }
  }

  // $0CD1: load a file below the compactor's work area at (address - LOW-MEM + $1000).
  * load() {
    const m = this.memory;
    m[0x9d] = yield* this.strout(LOADING);
    const file = this.disk.find(this.nameBytes());
    const data = file ? file.data : new Uint8Array(0);
    let index = 0;
    const read = () => {
      if (index >= data.length) return null;
      return data[index++];
    };
    let low = read(), high = read();
    if (low === null || high === null) {
      yield* this.cycles(20000);
      yield* this.strout(IO_ERROR);
      return;
    }
    if (m[0x02c5] === 0xea) {
      high = m[0x02c7];
      low = m[0x02cb];
    }
    if (m[0x0907] && high >= m[0x0908]) high = (high - 0x10) & 255;
    high = (high + 0x10) & 255;
    let address = ((high << 8) | low) - ((m[0x0904] << 8) | m[0x0903]);
    for (let value = read(); value !== null; value = read()) {
      m[address & 0xffff] = value;
      address++;
      if ((index & 255) === 0) yield* this.cycles(256 * DISK_CYCLES_PER_BYTE);
    }
    address = (address - 1) & 0xffff;
    // Only a higher end page counts: the low-byte comparison after BCS is never reached.
    if ((address >> 8) > m[0x0906]) {
      m[0x0905] = address & 255;
      m[0x0906] = address >> 8;
    }
    m[0x0909] = 0xff;
  }

  // $0EA6: initialize the drive and print the directory as a BASIC listing.
  * directory() {
    this.state = 'directory';
    this.kernal.clearScreen();
    yield* this.cycles(40758);
    const listing = this.disk.directory();
    let index = 0;
    // $0F0E: CHRIN, ending the listing once the status is set (the byte with EOI).
    const read = () => {
      if (index >= listing.length - 1) return null;
      return listing[index++];
    };
    listing: if (read() !== null && read() !== null) {
      for (;;) {
        if (read() === null || read() === null) break;
        const low = read(), high = read();
        if (low === null || high === null) break;
        yield* this.linprt(low | (high << 8));
        yield* this.chrout(0x20);
        for (;;) {
          const value = read();
          if (value === null) break listing;
          if (!value) break;
          yield* this.chrout(value);
        }
        yield* this.chrout(0x0d);
        yield* this.cycles(30 * DISK_CYCLES_PER_BYTE);
      }
    }
    for (let y = 0; y < 0x1b; y++) yield* this.chrout(0x2d);
    yield* this.chrout(0x0d);
  }

  // $0E02: length and block count of the data between $1000 and ($0905).
  * programLength() {
    const m = this.memory;
    yield* this.strout(LENGTH);
    let value = (((m[0x0906] - 0x10) & 255) << 8) | m[0x0905];
    yield* this.linprt(value);
    yield* this.strout(BYTES);
    let blocks = 1;
    while (value >> 8) {
      blocks++;
      value -= 254;
    }
    yield* this.linprt(blocks);
    yield* this.strout(BLOCKS);
  }

  // $097D: copy $1000..($0905) to the top of memory, ending at $FFFF.
  * moveToTop() {
    const m = this.memory;
    let source = (m[0x0906] << 8) | m[0x0905], target = 0xffff;
    while (source >= 0x1000) m[target--] = m[source--];
    m[0x5a] = source & 255;
    m[0x5b] = source >> 8;
    const start = target + 1;
    m[0x58] = start & 255;
    m[0x59] = start >> 8;
    yield* this.cycles((0x10000 - start) * 38);
  }

  // $0A93: the compressor. Labels follow the original; the border flashes per token.
  * compress() {
    this.state = 'compacting';
    const m = this.memory;
    const read = (offset = 0) => m[(((m[0x59] << 8) | m[0x58]) + offset) & 0xffff];
    const emit = value => {
      const at = (m[0x5b] << 8) | m[0x5a];
      m[at] = value & 255;
      m[0x5a] = (m[0x5a] + 1) & 255;
      if (!m[0x5a]) m[0x5b] = (m[0x5b] + 1) & 255;
    };
    // $0BA1: advance; true when the pointer wrapped past $FFFF.
    const next = () => {
      m[0x58] = (m[0x58] + 1) & 255;
      if (m[0x58]) return false;
      m[0x59] = (m[0x59] + 1) & 255;
      return m[0x59] === 0;
    };
    // $0C3A: does the next `length` bytes repeat immediately?
    const repeats = length => {
      m[0x74] = m[0x73] = length;
      m[0x75] = length * 2;
      m[0x72] = 0;
      for (;;) {
        const a = read(m[0x72]);
        m[0x72]++;
        if (a !== read(m[0x73])) return false;
        m[0x73]++;
        if (m[0x73] === m[0x75]) return true;
      }
    };
    // $0C28
    const pattern = () => {
      if (m[0x59] === 0xff) return false;
      if (repeats(8) || repeats(3)) {
        m[0x70] = 0xff;
        return true;
      }
      return false;
    };
    m[0x5a] = 0x39;
    m[0x5b] = 0x11;
    m[0x70] = 0;
    let label = 'token', x = 0, a = 0, start = 0, pushed = 0;
    const position = () => (m[0x59] << 8) | m[0x58];
    let lastPosition = position(), border = this.io[0x20];
    const borderWrites = [];
    for (;;) {
      switch (label) {
        case 'token': {
          // $0AA4: one border step per token.
          const now = position();
          const bytes = (now - lastPosition) & 0xffff;
          lastPosition = now;
          border = (border + 1) & 15;
          borderWrites.push([bytes, border]);
          if (borderWrites.length >= 64) yield* this.flashBorder(borderWrites);
          if (m[0x70]) { label = 'pattern'; break; }
          a = read(0);
          label = a === read(1) ? 'pair' : 'literal';
          break;
        }
        case 'literal': {
          // $0AB9
          x = 1;
          start = position();
          m[0x71] = 0;
          label = 'literalEnd';
          for (;;) {
            if (next()) break;
            a = read(0);
            if (a === read(1) && (a === 0 || a === 0xff || a === read(2))) break;
            if (pattern()) break;
            x++;
            if (x === 0x1f) { label = 'longLiteral'; break; }
          }
          break;
        }
        case 'literalEnd': {
          // $0AE9
          m[0x58] = start & 255;
          m[0x59] = start >> 8;
          if (x === 1) {
            a = read(0);
            if (a === 0 || a === 0xff) { label = 'pair'; break; }
          }
          emit(x | 0x20);
          do {
            emit(read(0));
            next();
          } while (--x);
          label = m[0x59] ? 'token' : 'end';
          break;
        }
        case 'pair': {
          // $0B17: two equal bytes; three are needed unless they are $00 or $FF.
          if (a !== 0 && a !== 0xff && a !== read(2)) { label = 'literal'; break; }
          x = 1;
          label = 'longRun';
          for (;;) {
            if (next() || read(0) !== a) { label = 'run'; break; }
            x++;
            if (x === 0x1f) break;
          }
          break;
        }
        case 'run': {
          // $0B36
          m[0x5c] = x;
          if (a === 0) emit(0xa0 | x);
          else if (a === 0xff) emit(0xc0 | x);
          else {
            emit(0xe0 | x);
            emit(a);
          }
          label = m[0x59] ? 'token' : 'end';
          break;
        }
        case 'longRun': {
          // $0B62: the counter steps its high byte when the low byte is 0 before INC.
          m[0x5c] = x;
          m[0x5d] = 0;
          pushed = a;
          for (;;) {
            if (next() || read(0) !== pushed) break;
            if (!m[0x5c]) m[0x5d]++;
            m[0x5c]++;
            if (m[0x5d] !== 0x1f || m[0x5c] !== 0xff) continue;
            m[0x5c]--;
            break;
          }
          emit(m[0x5d] | 0x80);
          emit(m[0x5c]);
          emit(pushed);
          label = m[0x59] ? 'token' : 'end';
          break;
        }
        case 'longLiteral': {
          // $0BAA
          m[0x5c] = x;
          m[0x71] = x;
          m[0x5d] = 0;
          for (;;) {
            if (next()) break;
            a = read(0);
            if (a === read(1) && (a === 0 || a === 0xff || a === read(2))) break;
            if (pattern()) break;
            if (!m[0x5c]) m[0x5d]++;
            m[0x5c]++;
            if (m[0x5d] !== 0x1f || m[0x5c] !== 0xff) continue;
            m[0x5c]--;
            break;
          }
          // $0BE4
          emit(m[0x5d] | 0x60);
          emit(m[0x5c]);
          m[0x58] = start & 255;
          m[0x59] = start >> 8;
          for (;;) {
            emit(read(0));
            next();
            m[0x5c] = (m[0x5c] - 1) & 255;
            if (m[0x5c]) continue;
            m[0x5d] = (m[0x5d] - 1) & 255;
            if (m[0x5d] & 0x80) break;
          }
          label = m[0x59] ? 'token' : 'end';
          break;
        }
        case 'pattern': {
          // $0C6C: count how often the 3- or 8-byte pattern repeats.
          const length = m[0x74];
          x = 1;
          m[0x72] = 0;
          m[0x70] = 0;
          m[0x73] = length;
          counting: for (;;) {
            for (let n = length; n; n--) {
              const value = read(m[0x72]);
              m[0x72]++;
              if (value !== read(m[0x73])) break counting;
              m[0x73]++;
            }
            x++;
            if (x === 0x1f) break;
          }
          emit(length === 8 ? x | 0x40 : x);
          for (let y = 0; y < length; y++) emit(read(y));
          if (length !== 8) m[0xff] = x;
          const advance = length === 8 ? (x << 3) & 255 : (x * 3) & 255;
          const target = position() + advance;
          m[0x58] = target & 255;
          m[0x59] = (target >> 8) & 255;
          label = 'token';
          break;
        }
        case 'end': {
          // $0C18
          emit(0);
          yield* this.flashBorder(borderWrites);
          this.io[0x20] = 0;
          return;
        }
      }
    }
  }

  // Spread the border changes over the time the compressor spends on those bytes.
  * flashBorder(writes) {
    for (const [bytes, color] of writes) {
      this.rasterWrites.push({ clock: (this.cycle - this.frameStart) % CYCLES_PER_FRAME, register: 0x20, value: color });
      this.io[0x20] = color;
      yield* this.cycles(60 + bytes * PACK_CYCLES_PER_BYTE);
    }
    writes.length = 0;
  }

  // $09C6: store the decruncher's parameters in its page at $0800.
  patchDecruncher() {
    const m = this.memory;
    const end = (m[0x5b] << 8) | m[0x5a];
    m[0x0905] = m[0x0844] = m[0x5a];
    m[0x0906] = m[0x0845] = m[0x5b];
    // SEC; SBC #$FF and SBC #$07 keep the borrow between the bytes.
    const plusOne = m[0x5a] - 0xff;
    m[0x0846] = plusOne & 255;
    m[0x0847] = (m[0x5b] - 7 - (plusOne < 0 ? 1 : 0)) & 255;
    const length = (end - 0x1138) & 0xffff;
    m[0x0844] = length & 255;
    m[0x0845] = length >> 8;
    const negative = (0x10000 - length) & 0xffff;
    m[0x0844] = negative & 255;
    m[0x0845] = negative >> 8;
  }

  // $0D9A: save $0801 onward from the copy at $1001, through the end pointer.
  * save() {
    const m = this.memory;
    this.state = 'saving';
    yield* this.strout(SAVING);
    if (m[0x9d] & 0x80) {
      for (const code of KERNAL_SAVING) yield* this.chrout(code);
      for (const code of this.nameBytes()) yield* this.chrout(code);
    }
    const end = (m[0x0906] << 8) | m[0x0905];
    const data = new Uint8Array(2 + end - 0x1001 + 1);
    data[0] = 0x01;
    data[1] = 0x08;
    data.set(m.subarray(0x1001, end + 1), 2);
    yield* this.cycles(data.length * DISK_CYCLES_PER_BYTE);
    const file = this.disk.save(this.nameBytes(), data);
    this.hooks.saved?.(file, data);
    yield* this.chrout(0x0d);
  }
}
