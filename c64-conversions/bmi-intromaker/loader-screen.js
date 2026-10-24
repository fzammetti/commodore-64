// The KERNAL's cleared screen while a program is copied down and decrunched: the BMI
// launchers call IOINIT and CINT, then RUN the packed program at $0801.
export class LoaderScreen {
  constructor(frames) {
    this.memory = new Uint8Array(65536);
    this.memory.fill(0x20, 0x0400, 0x07e8);
    this.io = new Uint8Array(4096);
    this.io[0x11] = 0x1b;
    this.io[0x16] = 0xc8;
    this.io[0x18] = 0x15;
    this.io[0x20] = 0x0e;
    this.io[0x21] = 0x06;
    this.io.fill(0x0e, 0x800, 0xbe8);
    this.io[0xd00] = 0x97;
    this.rasterWrites = [];
    this.remaining = frames;
  }

  get complete() {
    return this.remaining <= 0;
  }

  step() {
    this.remaining--;
  }
}
