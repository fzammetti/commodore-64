import { KernalScreen } from './kernal-screen.js';
import { CYCLES_PER_FRAME } from './timing.js';

// Compactor V4/S, run by menu option 6 from $CA00. Its $0A00 title types itself
// out with a block cursor and clicks the SID volume; a key skips to the linker.

export class CompactorModel {
  constructor(ram, io, linkerRam, linkerIo, chargen, timeline) {
    this.memory = new Uint8Array(ram);
    this.io = new Uint8Array(io);
    this.linker = { ram: linkerRam, io: linkerIo };
    this.chargen = chargen;
    this.typed = timeline.typed;
    this.clicks = timeline.clicks;
    this.typingEnd = timeline.typingEnd;
    this.frame = 0;
    this.cycle = 0;
    this.next = 0;
    this.nextClick = 0;
    this.sidWrites = [];
    this.halted = false;
    // $0A00: four glyphs into $0800, black screen, custom font, white text.
    this.memory.copyWithin(0x0800, 0x0a2a, 0x0a4a);
    this.io[0x20] = this.io[0x21] = 0;
    this.io[0x18] = 0x12;
    this.memory[0x0291] = 0x80;
    this.kernal = new KernalScreen(this.memory, this.io);
    this.kernal.chrout(0x05);
    this.state = 'typing';
  }

  get view() {
    const d018 = this.io[0x18];
    const font = d018 === 0x12 ? this.memory.subarray(0x0800, 0x1000)
      : this.chargen.subarray(d018 & 2 ? 0x800 : 0, d018 & 2 ? 0x1000 : 0x800);
    return {
      screen: this.memory.subarray(0x0400, 0x07e8), color: this.io.subarray(0x800, 0xbe8),
      font, border: this.io[0x20], background: this.io[0x21]
    };
  }

  // $0ABD: each character is followed by '@' (a solid block here) and CRSR LEFT.
  // The recorded text spans two pages because $0A80 patches the loop's operand.
  type(code) {
    if (code === 0x0d) this.kernal.chrout(0x20);
    this.kernal.chrout(code);
    this.kernal.chrout(0x40);
    this.kernal.chrout(0x9d);
  }

  // $0AF8: erase the block and silence the click, then wait for a key.
  finish() {
    this.kernal.chrout(0x20);
    this.sidWrites.push(0, 24, 0);
    this.state = 'waiting';
  }

  // $0B08: clear, uppercase/lowercase ROM font, then the linker asks for LOW-MEM.
  link() {
    this.memory = new Uint8Array(this.linker.ram);
    this.io = new Uint8Array(this.linker.io);
    this.kernal = new KernalScreen(this.memory, this.io);
    this.kernal.beginInput();
    this.state = 'linker';
  }

  key(code) {
    if (this.state === 'typing') {
      this.finish();
      this.link();
    } else if (this.state === 'waiting') this.link();
    else if (this.state === 'linker' && this.kernal.key(code)) {
      // The linker would now read its parameters and load files from disk.
      this.halted = true;
      this.kernal.beginInput();
    }
  }

  step() {
    const end = this.cycle + CYCLES_PER_FRAME;
    if (this.state === 'typing') {
      // $0AAF turns the volume up before each character and $0ADE turns it off.
      for (; this.nextClick < this.clicks.length && this.clicks[this.nextClick][0] < end; this.nextClick++) {
        const [cycle, value] = this.clicks[this.nextClick];
        this.sidWrites.push(cycle - this.cycle, 24, value);
      }
      for (; this.next < this.typed.length && this.typed[this.next][0] < end; this.next++) {
        this.type(this.typed[this.next][1]);
      }
      if (this.typingEnd < end) this.finish();
    }
    this.cycle = end;
    this.kernal.tick();
    this.frame++;
  }
}
