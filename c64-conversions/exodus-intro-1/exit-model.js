// SPACE runs $0b00: IOINIT, RESTOR and CINT (light blue border, blue screen), then the
// $033c copy of $4000-$FFFF to $0801 and RUN. The game that once followed the intro is
// not on this disk, so the copied power-up RAM fails as BASIC. This is the screen VICE
// shows: "?SYNTAX  ERROR", "READY." and the blinking KERNAL cursor.
const COPY_FRAMES = 55;       // $0b00 to RUN: 51.5 frames of CPU time plus badlines
const BLINK_FRAMES = 20;      // KERNAL cursor phase, toggled by the 60 Hz CIA IRQ
const LINES = [[1, '?SYNTAX  ERROR'], [2, 'READY.']];
const CURSOR = 0x0400 + 3 * 40;

export class ExitModel {
  constructor() {
    this.memory = new Uint8Array(65536);
    this.colorRam = new Uint8Array(1024).fill(14);
    this.memory.fill(0x20, 0x0400, 0x07e8);
    this.vic = new Uint8Array(64);
    this.vic[0x11] = 0x1b;
    this.vic[0x16] = 0x08;
    this.vic[0x18] = 0x14;
    this.vic[0x20] = 14;
    this.vic[0x21] = 6;
    this.view = { memory: this.memory, colorRam: this.colorRam, vic: this.vic, events: [] };
    this.frame = 0;
    this.blink = BLINK_FRAMES;
  }

  step() {
    this.frame++;
    if (this.frame < COPY_FRAMES) return;
    if (this.frame === COPY_FRAMES) {
      for (const [row, text] of LINES) {
        for (let column = 0; column < text.length; column++) {
          const byte = text.charCodeAt(column);
          this.memory[0x0400 + row * 40 + column] = byte >= 0x40 ? byte - 0x40 : byte;
        }
      }
      return;
    }
    if (--this.blink) return;
    this.blink = BLINK_FRAMES;
    this.memory[CURSOR] ^= 0x80;
  }
}
