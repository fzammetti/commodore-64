import { KernalScreen } from './kernal-screen.js';

// Intro/Editor I, the program SPACE decrunches to $C000 from the intro's attachment.
const MENU = [0xc404, 0xc430, 0xc45c, 0xc488, 0xc4b4, 0xc4e0];
const TEXTS = [0x1800, 0x1c00, 0x2a00];
// $C8FC/$C936/$C970 clear 255 bytes of four pages, then three page ends. The third
// routine clears $1EFF, inside scroll #2, instead of $2CFF.
const CLEAR_ENDS = [[0x18ff, 0x19ff, 0x1aff], [0x1cff, 0x1dff, 0x1eff], [0x2aff, 0x2bff, 0x1eff]];
const INSTRUCTIONS = Array.from({ length: 24 }, (_, line) => 0xc526 + line * 41);
const SAVE_FRAMES = 180;

export class EditorModel {
  constructor(ram, io, chargen) {
    this.memory = new Uint8Array(ram);
    this.io = new Uint8Array(io);
    this.chargen = chargen;
    this.kernal = new KernalScreen(this.memory, this.io);
    this.frame = 0;
    this.saved = null;
    this.exit = false;
    // $C000: black screen, lowercase characters, then the menu.
    this.io[0x20] = this.io[0x21] = 0;
    this.kernal.chrout(0x0e);
    this.menu();
  }

  get view() {
    return {
      screen: this.memory.subarray(0x0400, 0x07e8), color: this.io.subarray(0x800, 0xbe8),
      font: this.chargen.subarray(this.io[0x18] & 2 ? 0x800 : 0, this.io[0x18] & 2 ? 0x1000 : 0x800),
      border: this.io[0x20], background: this.io[0x21]
    };
  }

  string(address) {
    const text = [];
    for (let code = this.memory[address]; code; code = this.memory[++address]) text.push(code);
    return text;
  }

  // $C00D
  menu() {
    const k = this.kernal;
    k.chrout(0x93);
    k.print(this.string(0xc3ce));
    k.chrout(0x0d);
    k.chrout(0x0d);
    for (const address of MENU) k.print(this.string(address));
    this.state = 'menu';
  }

  // $C0C7/$C120/$C179: clear the text, then edit it as one screen of KERNAL input.
  edit(index) {
    const m = this.memory, k = this.kernal;
    k.chrout(0x93);
    for (let page = 0; page < 4; page++) m.fill(0, TEXTS[index] + page * 256, TEXTS[index] + page * 256 + 255);
    for (const address of CLEAR_ENDS[index]) m[address] = 0;
    k.color = 1;
    k.beginInput();
    this.text = TEXTS[index];
    this.state = 'edit';
  }

  // After RETURN the screen codes become the text; '@' is code 0, the end marker.
  store() {
    const m = this.memory;
    for (let page = 0; page < 4; page++) {
      m.copyWithin(this.text + page * 256, 0x0400 + page * 256, 0x0400 + page * 256 + 255);
    }
    for (let page = 0; page < 3; page++) m[this.text + page * 256 + 255] = m[0x04ff + page * 256];
    this.menu();
  }

  // $C1D2: SAVE "INTRO",8 from $0800 to $2DFF.
  save() {
    this.kernal.chrout(0x93);
    this.kernal.print(this.string(0xc50c));
    this.kernal.color = 0;
    this.wait = SAVE_FRAMES;
    this.state = 'saving';
  }

  // $C218
  instructions() {
    const k = this.kernal;
    k.chrout(0x93);
    k.color = 7;
    for (const address of INSTRUCTIONS) k.print(this.string(address));
    this.state = 'instructions';
  }

  program() {
    const file = new Uint8Array(2 + 0x2600);
    file[1] = 0x08;
    file.set(this.memory.subarray(0x0800, 0x2e00), 2);
    return file;
  }

  key(code) {
    if (this.state === 'menu') {
      if (code >= 0x31 && code <= 0x33) this.edit(code - 0x31);
      else if (code === 0x34) this.save();
      else if (code === 0x35) this.instructions();
      else if (code === 0x36) {
        // $C3C5: clear the screen and run the linker/compactor from $CA00.
        this.kernal.chrout(0x93);
        this.exit = true;
      }
    } else if (this.state === 'edit') {
      if (this.kernal.key(code)) this.store();
    } else if (this.state === 'instructions') {
      this.menu();
    }
  }

  step() {
    this.kernal.tick();
    if (this.state === 'saving' && !--this.wait) {
      this.saved = this.program();
      this.menu();
    }
    this.frame++;
  }
}
