// JavaScript translation of the C64 KERNAL (901227-03) screen editor: CHROUT to the
// screen ($E716), the full-screen line input ($E5CA-$E683), line linking, scrolling,
// insertion and the cursor blink in the IRQ ($EA34). All state lives at the original
// zero-page and $02xx addresses, so programs that poke those locations behave the same.

const LINE_LOW = [0x00, 0x28, 0x50, 0x78, 0xa0, 0xc8, 0xf0, 0x18, 0x40, 0x68, 0x90, 0xb8, 0xe0,
  0x08, 0x30, 0x58, 0x80, 0xa8, 0xd0, 0xf8, 0x20, 0x48, 0x70, 0x98, 0xc0];
const COLOR_CODES = [0x90, 0x05, 0x1c, 0x9f, 0x9c, 0x1e, 0x1f, 0x9e,
  0x81, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0x9b];

const PNT = 0xd1, USER = 0xf3, COLUMN = 0xd3, ROW = 0xd6, LENGTH = 0xd5, LINKS = 0xd9;
const QUOTE = 0xd4, INSERT = 0xd8, REVERSE = 0xc7, COLOR = 0x286, SCREEN = 0x288;

export class KernalScreen {
  constructor(machine) {
    this.machine = machine;
  }

  get m() {
    return this.machine.memory;
  }

  // Color RAM is mapped from the I/O image; everything else is RAM.
  peek(address) {
    if (address >= 0xd800 && address < 0xdc00) return this.machine.io[0x800 + (address & 0x3ff)] & 15;
    return this.m[address & 0xffff];
  }

  poke(address, value) {
    if (address >= 0xd800 && address < 0xdc00) this.machine.io[0x800 + (address & 0x3ff)] = value & 15;
    else this.m[address & 0xffff] = value & 255;
  }

  word(zp) {
    return this.m[zp] | (this.m[zp + 1] << 8);
  }

  // ($D1),Y and ($F3),Y
  screenAt(y) { return this.peek(this.word(PNT) + y); }
  setScreen(y, value) { this.poke(this.word(PNT) + y, value); }
  colorAt(y) { return this.peek(this.word(USER) + y); }
  setColor(y, value) { this.poke(this.word(USER) + y, value); }

  // $E544
  clearScreen() {
    const m = this.m;
    let high = m[SCREEN] | 0x80, low = 0, x;
    for (x = 0; x < 0x1a; x++) {
      m[LINKS + x] = high;
      low += 0x28;
      if (low > 255) {
        low &= 255;
        high = (high + 1) & 255;
      }
    }
    m[LINKS + x] = 0xff;
    for (x = 0x18; x >= 0; x--) this.clearLine(x);
    this.home();
  }

  // $E566
  home() {
    this.m[COLUMN] = 0;
    this.m[ROW] = 0;
    this.setLine();
  }

  // $E56C: locate the logical line containing the cursor row.
  setLine() {
    const m = this.m;
    let x = m[ROW], a = m[COLUMN];
    while (!(m[LINKS + x] & 0x80)) {
      a = (a + 0x28) & 255;
      m[COLUMN] = a;
      x = (x - 1) & 255;
      if (x & 0x80) break;
    }
    this.linePointer(x);
    a = 0x27;
    x = (x + 1) & 255;
    while (!(m[LINKS + x] & 0x80)) {
      a = (a + 0x28) & 255;
      x = (x + 1) & 255;
      if (x & 0x80) break;
    }
    m[LENGTH] = a;
    this.userPointer();
    return x;
  }

  // $E9F0
  linePointer(x) {
    const m = this.m;
    m[PNT] = LINE_LOW[x] ?? 0;
    m[PNT + 1] = (m[LINKS + x] & 3) | m[SCREEN];
  }

  // $EA24
  userPointer() {
    const m = this.m;
    m[USER] = m[PNT];
    m[USER + 1] = (m[PNT + 1] & 3) | 0xd8;
  }

  // $E9FF
  clearLine(x) {
    this.linePointer(x);
    this.userPointer();
    for (let y = 0x27; y >= 0; y--) {
      this.setColor(y, this.m[COLOR]);
      this.setScreen(y, 0x20);
    }
  }

  // $EA13: store a screen code and color at the cursor.
  putAtCursor(code, color) {
    this.m[0xcd] = 2;
    this.userPointer();
    const y = this.m[COLUMN];
    this.setScreen(y, code);
    this.setColor(y, color);
  }

  // $E716: CHROUT for the screen.
  print(character) {
    const m = this.m;
    m[0xd7] = character;
    m[0xd0] = 0;
    let y = m[COLUMN];
    let a = character;
    if (a & 0x80) {
      this.printShifted(a & 0x7f);
      return this.finish();
    }
    if (a === 0x0d) return this.carriageReturn();
    if (a >= 0x20) {
      a = a < 0x60 ? a & 0x3f : a & 0xdf;
      a = this.quoteCheck(a);
      return this.putCharacter(a, true);
    }
    if (m[INSERT]) return this.putCharacter(a, false);
    if (a === 0x14) {
      if (y === 0) {
        if (!this.previousLineEnd()) return this.finish();
        y = m[COLUMN];
      } else {
        this.checkRowStart();
        y--;
        m[COLUMN] = y;
        this.userPointer();
        while (y !== m[LENGTH]) {
          y++;
          const code = this.screenAt(y);
          this.setScreen(y - 1, code);
          const color = this.colorAt(y);
          this.setColor(y - 1, color);
        }
      }
      this.setScreen(y, 0x20);
      this.setColor(y, m[COLOR]);
      return this.finish();
    }
    if (m[QUOTE]) return this.putCharacter(a, false);
    if (a === 0x12) m[REVERSE] = a;
    if (a === 0x13) this.home();
    if (a === 0x1d) {
      y++;
      this.checkRowEnd();
      m[COLUMN] = y;
      y--;
      if (y >= m[LENGTH]) {
        m[ROW]--;
        this.nextLine();
        m[COLUMN] = 0;
      }
      return this.finish();
    }
    if (a === 0x11) {
      let column = y + 0x28;
      m[ROW]++;
      if (column <= m[LENGTH]) {
        m[COLUMN] = column;
        return this.finish();
      }
      m[ROW]--;
      // SBC #$28 with the carry left set by the comparison.
      for (;;) {
        column -= 0x28;
        if (column < 0) break;
        m[COLUMN] = column;
        if (column === 0) break;
      }
      this.nextLine();
      return this.finish();
    }
    this.setColorCode(a);
    this.controlCode(a);
    return this.finish();
  }

  // $E684
  quoteCheck(a) {
    if (a === 0x22) this.m[QUOTE] ^= 1;
    return a;
  }

  // $E691-$E6A5: reverse/insert handling, store, advance.
  putCharacter(a, normal) {
    const m = this.m;
    if (normal) {
      if (m[REVERSE]) a |= 0x80;
    } else {
      a |= 0x80;
    }
    if (m[INSERT]) m[INSERT]--;
    this.putAtCursor(a & 255, m[COLOR]);
    this.advance();
    return this.finish();
  }

  // $E6A8
  finish() {
    if (this.m[INSERT]) this.m[QUOTE] >>= 1;
  }

  // $E6B6: move right after storing a character, linking or opening lines as needed.
  advance() {
    const m = this.m;
    const x = this.checkRowEnd();
    m[COLUMN]++;
    if (m[LENGTH] >= m[COLUMN]) return;
    if (m[LENGTH] === 0x4f) {
      m[ROW]--;
      this.nextLine();
      m[COLUMN] = 0;
      return;
    }
    if (m[0x292]) {
      this.openLine(x);
      return;
    }
    let row = m[ROW];
    if (row >= 0x19) {
      this.scrollUp();
      m[ROW]--;
      row = m[ROW];
    }
    this.linkRow(row);
  }

  // $E6DA-$E6F4: make `row` a continuation of the line above.
  linkRow(row) {
    const m = this.m;
    m[LINKS + row] &= 0x7f;
    m[LINKS + row + 1] |= 0x80;
    m[LENGTH] = (m[LENGTH] + 0x28) & 255;
    let x = row;
    while (!(m[LINKS + x] & 0x80)) {
      x--;
      if (x === 0) break;
    }
    this.linePointer(x);
  }

  // $E701: move to the end of the previous line; false at the top-left corner.
  previousLineEnd() {
    const m = this.m;
    if (m[ROW] === 0) {
      m[COLUMN] = 0;
      return false;
    }
    m[ROW]--;
    this.setLine();
    m[COLUMN] = m[LENGTH];
    return true;
  }

  // $E8A1
  checkRowStart() {
    const m = this.m;
    for (let a = 0, x = 2; x; x--, a += 0x28) {
      if (a === m[COLUMN]) {
        m[ROW]--;
        return;
      }
    }
  }

  // $E8B3: returns X as the original leaves it.
  checkRowEnd() {
    const m = this.m;
    for (let a = 0x27, x = 2; x; x--, a += 0x28) {
      if (a === m[COLUMN]) {
        const row = m[ROW];
        if (row !== 0x19) m[ROW]++;
        return row;
      }
    }
    return 0;
  }

  // $E87C
  nextLine() {
    const m = this.m;
    m[0xc9] >>= 1;
    let x = m[ROW];
    do {
      x++;
      if (x === 0x19) x = this.scrollUp();
    } while (!(m[LINKS + x] & 0x80));
    m[ROW] = x;
    this.setLine();
  }

  // $E891
  carriageReturn() {
    const m = this.m;
    m[INSERT] = m[REVERSE] = m[QUOTE] = m[COLUMN] = 0;
    this.nextLine();
    return this.finish();
  }

  // $E8CB
  setColorCode(a) {
    const index = COLOR_CODES.indexOf(a);
    if (index >= 0) this.m[COLOR] = index;
  }

  // $EC44: character set and case-lock codes.
  controlCode(a) {
    const m = this.m, io = this.machine.io;
    if (a === 0x0e) io[0x18] |= 2;
    else if (a === 0x8e) io[0x18] &= 0xfd;
    else if (a === 0x08) m[0x291] |= 0x80;
    else if (a === 0x09) m[0x291] &= 0x7f;
  }

  // $E7D4: shifted PETSCII codes.
  printShifted(a) {
    const m = this.m;
    if (a === 0x7f) a = 0x5e;
    if (a >= 0x20) {
      this.putCharacter(a | 0x40, true);
      return;
    }
    if (a === 0x0d) {
      this.carriageReturn();
      return;
    }
    if (m[QUOTE]) {
      this.putCharacter(a | 0x40, false);
      return;
    }
    if (a === 0x14) {
      this.insertSpace();
      return;
    }
    if (m[INSERT]) {
      this.putCharacter(a | 0x40, false);
      return;
    }
    if (a === 0x11) {
      if (m[ROW] === 0) return;
      m[ROW]--;
      const column = m[COLUMN] - 0x28;
      if (column >= 0) m[COLUMN] = column;
      else this.setLine();
      return;
    }
    if (a === 0x12) m[REVERSE] = 0;
    if (a === 0x1d) {
      if (m[COLUMN] === 0) this.previousLineEnd();
      else {
        this.checkRowStart();
        m[COLUMN]--;
      }
      return;
    }
    if (a === 0x13) {
      this.clearScreen();
      return;
    }
    this.setColorCode(a | 0x80);
    this.controlCode(a | 0x80);
  }

  // $E7F2: INST
  insertSpace() {
    const m = this.m;
    let y = m[LENGTH];
    if (!(this.screenAt(y) === 0x20 && y !== m[COLUMN])) {
      if (y === 0x4f) return;
      this.insertLine();
    }
    y = m[LENGTH];
    this.userPointer();
    do {
      y--;
      this.setScreen(y + 1, this.screenAt(y));
      this.setColor(y + 1, this.colorAt(y));
    } while (y !== m[COLUMN]);
    this.setScreen(y, 0x20);
    this.setColor(y, m[COLOR]);
    m[INSERT]++;
  }

  // $E965: extend the current logical line for INST.
  insertLine() {
    this.openLine(this.m[ROW]);
  }

  // $E967: open a blank row below by scrolling the rest of the screen down.
  openLine(x) {
    const m = this.m;
    do x++; while (!(m[LINKS + x] & 0x80));
    m[0x2a5] = x;
    if (x > 0x18) {
      this.scrollUp();
      m[ROW]--;
      this.linkRow(m[0x2a5] - 1);
      return;
    }
    const saved = m.slice(0xac, 0xb0);
    for (x = 0x18; x > m[0x2a5]; x--) {
      this.linePointer(x);
      m[0xac] = LINE_LOW[x - 1];
      this.copyLine(m[LINKS + x - 1]);
    }
    this.linePointer(x);
    this.clearLine(x);
    for (x = 0x17; x && x >= m[0x2a5]; x--) {
      m[LINKS + x + 1] = (m[LINKS + x + 1] & 0x7f) | (m[LINKS + x] & 0x80);
    }
    this.linkRow(m[0x2a5]);
    m.set(saved, 0xac);
  }

  // $E9C8: copy the line at ($AC) into the line at ($D1), with colors.
  copyLine(link) {
    const m = this.m;
    m[0xad] = (link & 3) | m[SCREEN];
    m[0xae] = m[0xac];
    m[0xaf] = (m[0xad] & 3) | 0xd8;
    this.userPointer();
    const source = this.word(0xac), sourceColor = this.word(0xae);
    for (let y = 0x27; y >= 0; y--) {
      this.setScreen(y, this.peek(source + y));
      this.setColor(y, this.peek(sourceColor + y));
    }
  }

  // $E8EA: scroll the screen up one logical line; returns the X the original returns.
  scrollUp() {
    const m = this.m;
    const saved = m.slice(0xac, 0xb0);
    do {
      m[ROW]--;
      m[0xc9]--;
      m[0x2a5]--;
      let x = 0;
      for (; x < 0x18; x++) {
        this.linePointer(x);
        m[0xac] = LINE_LOW[x + 1];
        this.copyLine(m[LINKS + x + 1]);
      }
      this.linePointer(x);
      this.clearLine(x);
      for (x = 0; x < 0x18; x++) {
        m[LINKS + x] = (m[LINKS + x] & 0x7f) | (m[LINKS + x + 1] & 0x80);
      }
      m[0xf1] |= 0x80;
    } while (!(m[LINKS] & 0x80));
    m[ROW]++;
    m[0x2a5]++;
    m.set(saved, 0xac);
    return m[ROW];
  }

  // $EA34-$EA5E, once per jiffy.
  blink() {
    const m = this.m;
    if (m[0xcc]) return;
    if (--m[0xcd] & 255) return;
    m[0xcd] = 0x14;
    const y = m[COLUMN];
    const visible = m[0xcf] & 1;
    m[0xcf] >>= 1;
    let color = m[0x287], code = this.screenAt(y);
    if (!visible) {
      m[0xcf]++;
      m[0xce] = code;
      this.userPointer();
      m[0x287] = this.colorAt(y);
      color = m[COLOR];
      code = m[0xce];
    }
    this.setScreen(y, code ^ 0x80);
    this.setColor(y, color);
  }

  // $E5CD-$E5E4: a key arrived while the input loop waits; restore the cursor cell.
  hideCursor() {
    const m = this.m;
    if (!m[0xcf]) return;
    const code = m[0xce], color = m[0x287];
    m[0xcf] = 0;
    this.putAtCursor(code, color);
  }

  // $E602-$E683 after RETURN: read the first character of the logical line.
  // Returns the PETSCII value the KERNAL hands back to the caller.
  readLine() {
    const m = this.m;
    let y = m[LENGTH];
    m[0xd0] = y;
    while (this.screenAt(y) === 0x20) {
      y--;
      if (y === 0) break;
    }
    m[0xc8] = y + 1;
    m[0x292] = 0;
    m[COLUMN] = 0;
    m[QUOTE] = 0;
    if (!(m[0xc9] & 0x80)) {
      const row = m[ROW];
      if (row !== m[0xc9]) this.lineStart(row);
      if (row === m[0xc9]) {
        m[COLUMN] = m[0xca];
        if (m[0xca] >= m[0xc8]) return this.endOfInput();
      }
    }
    return this.readCharacter();
  }

  // $E6ED
  lineStart(x) {
    const m = this.m;
    while (!(m[LINKS + x] & 0x80)) {
      x--;
      if (x === 0) break;
    }
    this.linePointer(x);
  }

  // $E63A-$E683
  readCharacter() {
    const m = this.m;
    const y = m[COLUMN];
    const code = this.screenAt(y);
    let a = code & 0x3f;
    const shifted = (code << 1) & 255;
    if (shifted & 0x80) a |= 0x80;
    let keep = false;
    if (code & 0x80) keep = m[QUOTE] !== 0;
    if (!keep && !(shifted & 0x40)) a |= 0x40;
    m[COLUMN]++;
    a = this.quoteCheck(a);
    if (y !== m[0xc8]) return a === 0xde ? 0xff : a;
    return this.endOfInput();
  }

  endOfInput() {
    const m = this.m;
    m[0xd0] = 0;
    if (m[0x99] === 3 || m[0x9a] !== 3) this.print(0x0d);
    return 0x0d;
  }
}
