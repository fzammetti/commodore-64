import { Machine } from './machine.js';

// Addresses of the editor's zero-terminated strings.
const TITLE = 0x4321, MENU = [0x434a, 0x4373, 0x439c, 0x43c5, 0x43ee, 0x4417];
const LINE_PROMPTS = [0x422f, 0x4258, 0x4281];
// Where each typed line is stored in the intro's screen data ($0C00 = screen row 0).
const LINE_TARGETS = [0x0db8, 0x0de0, 0x0e08];
const INSTRUCTIONS = [0xe0, 0xf0];

/**
 * Native translation of the BMI Intro Editor V1.0 ($4000-$4320) by Fantasy of NPN.
 * The editor keeps the intro template at $0800-$37FF: scroll #1 at $3000, scroll #2 at
 * $3400 (both typed straight into screen memory) and the screen data at $0C00.
 */
export class EditorModel extends Machine {
  constructor(ram, io, hooks = {}) {
    super(ram, io);
    this.hooks = hooks;
    this.state = 'menu';
    this.start(this.main());
  }

  setScreenBase(high) {
    // Bit 0 of $D018 reads back as 1.
    this.io[0x18] = ((this.io[0x18] | 1) & 0x0f) | high;
  }

  * main() {
    const m = this.memory;
    this.io[0x20] = 0;
    this.io[0x21] = 0;
    m[0x286] = 3;
    for (;;) {
      this.state = 'menu';
      yield* this.chrout(0x93);
      yield* this.strout(TITLE);
      yield* this.chrout(0x0d);
      yield* this.chrout(0x0d);
      for (const item of MENU) {
        m[0x286] = 7;
        yield* this.strout(item);
      }
      let choice;
      do choice = yield* this.waitKey(); while (choice < 0x31 || choice > 0x36);
      if (choice === 0x31) yield* this.editScroll(0xc0, 0x30);
      else if (choice === 0x32) yield* this.editScroll(0xd0, 0x34);
      else if (choice === 0x33) yield* this.editScreenData();
      else if (choice === 0x34) yield* this.save();
      else if (choice === 0x35) {
        // $42E1: clear, then $4800 runs the packed compactor at $4900.
        yield* this.chrout(0x93);
        this.state = 'compactor';
        this.hooks.compactor?.(this);
        return;
      } else yield* this.instructions();
    }
  }

  // $40B0/$40E0: the KERNAL screen editor works directly on the scroll buffer.
  * editScroll(screenBits, page) {
    const m = this.memory;
    this.state = 'scroll';
    yield* this.chrout(0x93);
    this.setScreenBase(screenBits);
    m[0x288] = page;
    yield* this.chrout(0x93);
    yield* this.inputLine();
    this.setScreenBase(0x10);
    m[0x288] = 4;
  }

  // $410F: three 40-character lines for screen rows 11-13 of the intro.
  * editScreenData() {
    const m = this.memory;
    this.state = 'screen';
    for (let line = 0; line < 3; line++) {
      yield* this.chrout(0x93);
      for (let index = 0; index < 6; index++) yield* this.chrout(0x0d);
      m[0x286] = 2;
      yield* this.strout(LINE_PROMPTS[line]);
      yield* this.chrout(0x13);
      yield* this.readLine40();
      // The third copy loop lacks its BNE, so only the first character is stored.
      const count = line === 2 ? 1 : 40;
      for (let x = 0; x < count; x++) m[LINE_TARGETS[line] + x] = (m[0x0400 + x] + 0x80) & 255;
    }
  }

  // $41CE: GETIN line input with its own block cursor on row 0.
  * readLine40() {
    const m = this.memory;
    m[0x286] = 7;
    m[0x42aa] = 0;
    for (;;) {
      if (m[0x42aa] === 0x28) {
        const key = yield* this.waitKey();
        if (key === 0x0d) return;
        if (key === 0x14) yield* this.deleteCharacter();
        continue;
      }
      m[0x0400 + m[0x42aa]] = 0xa0;
      const key = yield* this.waitKey();
      if (key === 0x14) {
        yield* this.deleteCharacter();
        continue;
      }
      m[0x0400 + m[0x42aa]] = 0x20;
      yield* this.chrout(key);
      m[0x42aa]++;
    }
  }

  // $4208
  * deleteCharacter() {
    const m = this.memory;
    if (!m[0x42aa]) return;
    m[0x0400 + m[0x42aa]] = 0x20;
    m[0x42aa]--;
    yield* this.chrout(0x14);
  }

  // $42AC: SAVE "INTRO",8 from $0800 to $37FF. Program mode prints no messages.
  * save() {
    const m = this.memory;
    this.state = 'saving';
    yield* this.chrout(0x93);
    m[0x286] = 5;
    const data = new Uint8Array(2 + 0x3000);
    data[0] = 0x00;
    data[1] = 0x08;
    data.set(m.subarray(0x0800, 0x3800), 2);
    this.hooks.save?.('INTRO', data);
    // A 1541 needs about half a minute for these 49 blocks; the browser waits briefly.
    for (let frame = 0; frame < 90; frame++) yield 'frame';
  }

  // $42EB: two pre-drawn pages at $3800 and $3C00.
  * instructions() {
    this.state = 'instructions';
    yield* this.chrout(0x93);
    for (const page of INSTRUCTIONS) {
      this.setScreenBase(page);
      yield* this.waitKey();
    }
    this.setScreenBase(0x10);
  }
}
