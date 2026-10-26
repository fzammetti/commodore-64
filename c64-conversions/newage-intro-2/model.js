// Native translation of Fantasy's $1B87..$1FD1 intro effects. Addresses are
// retained so the recovered tables and the annotated 6502 listing remain useful.
export class IntroModel {
  constructor(data, io, timing) {
    if (data.byteLength !== 0x2400 || io.byteLength !== 0x1000) {
      throw new Error('The intro requires its extracted 9 KiB asset and 4 KiB I/O seed.');
    }
    this.memory = new Uint8Array(65536);
    this.memory.set(new Uint8Array(data));
    this.io = new Uint8Array(io).slice();
    this.timing = timing;
    this.frame = 0;
    this.screenMemory = new Uint8Array(1000);
    this.rasterWrites = [];
  }

  ready(address, delay) {
    if (this.memory[address] !== delay) {
      this.memory[address]++;
      return false;
    }
    this.memory[address] = 0;
    return true;
  }

  rotate(address, length, right = false) {
    const m = this.memory;
    if (right) {
      const last = m[address + length - 1];
      m.copyWithin(address + 1, address, address + length - 1);
      m[address] = last;
    } else {
      const first = m[address];
      m.copyWithin(address, address + 1, address + length);
      m[address + length - 1] = first;
    }
  }

  scroll() {
    const m = this.memory;
    if (--m[0x1f20] !== 0xbf) return;
    m[0x1f20] = 0xc7;
    // Preserve the original 40-byte shift, including its extra rightmost cell.
    m.copyWithin(0x798, 0x799, 0x7c1);
    const pointer = m[0xb0] | m[0xb1] << 8;
    if (m[pointer] === 0) {
      m[0xb0] = 0;
      m[0xb1] = 0x20;
    } else {
      m[0x7bf] = m[pointer];
      m[0xb0] = (pointer + 1) & 255;
      m[0xb1] = (pointer + 1) >> 8;
    }
  }

  step() {
    const m = this.memory;
    // The VIC reads the scroller before the bottom IRQ shifts its screen RAM.
    this.screenMemory.set(m.subarray(0x400, 0x7e8));
    // Retain the measured NTSC IRQ-latency variation instead of freezing one
    // frame's bus timings. Colors and fine scrolling still use the live tables.
    this.rasterWrites = this.timing.map(e => ({
      clock: e.clock + (e.delays?.[this.frame % e.delays.length] ?? 0),
      register: e.register, value: e.address === null ? e.value : m[e.address]
    }));
    if (this.ready(0x1c95, 2)) this.rotate(0x1c62, 8);
    if (this.ready(0x1d45, 2)) this.rotate(0x1d12, 8, true);
    if (this.ready(0x1f65, 2)) this.rotate(0x1ef9, 30);
    this.scroll();
    if (this.ready(0x1f9e, 3)) {
      this.rotate(0x1f21, 8);
      this.rotate(0x1f31, 8, true);
      this.rotate(0x1f2a, 7);
    }
    if (this.ready(0x1e4a, 2)) {
      this.rotate(0x1dce, 20);
      this.rotate(0x1de2, 20, true);
      if (this.ready(0x1ea9, 2)) {
        this.rotate(0x1df6, 20);
        this.rotate(0x1e0a, 20, true);
      }
    }
    // This unused visual counter still runs in the original logo interrupt.
    m[0x1d6a] = (m[0x1d6a] + 1) % 3;
    this.frame++;
  }
}
