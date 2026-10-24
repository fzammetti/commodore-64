// $2900 and $CA00 reset the I/O with IOINIT/RESTOR/CINT, set a black border and
// copy the next program to $0801 with interrupts off. It then decrunches itself,
// so the screen stays blank, CINT's blue on black, until that program draws.
export class ResetModel {
  constructor(chargen, { frames, cintFrame = 0, blackFrame = 3, before = null }) {
    this.frames = frames;
    this.cintFrame = cintFrame;
    this.blackFrame = blackFrame;
    this.before = before;
    this.frame = 0;
    this.complete = false;
    this.blank = {
      screen: new Uint8Array(1000).fill(0x20), color: new Uint8Array(1000).fill(14),
      font: chargen.subarray(0, 0x800), border: 14, background: 6
    };
  }

  get view() {
    if (this.frame < this.cintFrame && this.before) return this.before;
    return { ...this.blank, border: this.frame < this.blackFrame ? 14 : 0 };
  }

  step() {
    this.frame++;
    this.complete = this.frame >= this.frames;
  }
}
