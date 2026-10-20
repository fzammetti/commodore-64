export { FRAME_RATE } from "./timing.js";

export const PALETTE = [
  0x000000, 0xffffff, 0x813338, 0x75cec8, 0x8e3c97, 0x56ac4d, 0x2e2c9b, 0xedf171,
  0x8e5029, 0x553800, 0xc46c71, 0x4a4a4a, 0x7b7b7b, 0xa9ff9f, 0x706deb, 0xb2b2b2
];


export class DemoModel {

  constructor(inData) {
    this.memory = new Uint8Array(inData.slice(0, 65536));
    this.io = new Uint8Array(inData.slice(65536, 69632));
    this.frame = 0;
  }

  ready(inAddress, inDelay) {
    if (this.memory[inAddress] !== inDelay) {
      this.memory[inAddress]++;
      return false;
    }
    this.memory[inAddress] = 0;
    return true;
  }

  rotateLeft(inAddress, inLength) {
    const first = this.memory[inAddress];
    this.memory.copyWithin(inAddress, inAddress + 1, inAddress + inLength);
    this.memory[inAddress + inLength - 1] = first;
  }

  rotateRight(inAddress, inLength) {
    const last = this.memory[inAddress + inLength - 1];
    this.memory.copyWithin(inAddress + 1, inAddress, inAddress + inLength - 1);
    this.memory[inAddress] = last;
  }

  get textPointer() {
    return this.memory[0xb0] + this.memory[0xb1] * 256;
  }

  set textPointer(inValue) {
    this.memory[0xb0] = inValue & 255;
    this.memory[0xb1] = inValue >> 8;
  }

}


export class FantasyModel extends DemoModel {

  step() {
    this.openRasterCurtain();
    if (this.ready(0x42b3, 3)) {
      this.rotateLeft(0x428b, 8);
    }
    this.animateLogoPixels();
    if (this.memory[0x424b] === 1) {
      this.scroll();
      if (this.ready(0x4981, 3)) {
        this.rotateLeft(0x405f, 8);
        this.rotateRight(0x40a7, 8);
      }
      if (this.ready(0x49c6, 3)) {
        this.rotateLeft(0x4283, 8);
        this.rotateRight(0x4293, 8);
      }
      this.bounceRasterBars();
      if (this.ready(0x43de, 4)) {
        this.animateSprites();
      }
    }
    this.io[0x016] = 0xc8;
    this.io[0x018] = 0x1c;
    this.frame++;
  }

  openRasterCurtain() {
    const m = this.memory;
    if (m[0x405c] === 1 || !this.ready(0x405d, 3)) {
      return;
    }
    m.copyWithin(0x417b, 0x417c, 0x41cc);
    m[0x41ca] = m[0x41cb];
    this.rotateRight(0x41cb, 80);
    m[0x40af]++;
    if (m[0x40af] === 40) {
      m[0x405c] = 1;
      m[0x43dc] = 1;
      m[0x424b] = 1;
    }
    m.set(m.subarray(0x417b, 0x41a3), 0x405f);
    m.set(m.subarray(0x41cb, 0x41f3), 0x4087);
  }

  animateLogoPixels() {
    const m = this.memory;
    if (m[0x43dc] !== 1 || !this.ready(0x439d, 3)) {
      return;
    }
    if (m[0x439e] === 28) {
      m[0x439e] = 0;
    }
    const source = 0x3400 + m[0x4376 + m[0x439e]];
    m.set(m.subarray(source, source + 8), 0x30f0);
    m.set(m.subarray(source, source + 8), 0x30f8);
    m[0x439e]++;
  }

  scroll() {
    const m = this.memory;
    if (m[0x42b4] !== 0) {
      m[0x42b4]--;
      return;
    }
    m[0x4343] -= m[0x430e] === 1 ? 2 : 1;
    if (m[0x4343] !== 0xbf) {
      return;
    }
    m[0x4343] = 0xc7;
    m.copyWithin(0x770, 0x771, 0x799);
    for (let count = 0; count < 128; count++) {
      const value = m[this.textPointer];
      if (value === 0) {
        this.textPointer = 0x5000;
      } else if (value === 0x1f) {
        m[0x430e] = m[0x430e] === 1 ? 0 : 1;
        this.textPointer++;
      } else if (value === 0x1e) {
        m[0x42b4] = 106;
        this.textPointer++;
      } else {
        m[0x797] = value === 32 ? 0xa0 : value;
        this.textPointer++;
        return;
      }
    }
    throw new Error(`Fantasy scroll command stream did not produce a character.`);
  }

  bounceRasterBars() {
    const m = this.memory;
    if (!this.ready(0x4912, 3)) {
      return;
    }
    for (const [position, direction, palette] of [
      [0x4910, 0x4913, 0x4915], [0x4911, 0x4914, 0x492d]
    ]) {
      m[position] += m[direction] === 1 ? 1 : -1;
      if (m[position] === 8) {
        m[direction] = 1;
      } else if (m[position] === 48) {
        m[direction] = 0;
      }
      if (m[direction] === 1) {
        this.rotateRight(palette, 24);
      } else {
        this.rotateLeft(palette, 24);
      }
    }
    m.fill(0, 0x4067, 0x40a7);
    const first = m[0x4913] === 0 ? 0x4910 : 0x4911;
    const second = first === 0x4910 ? 0x4911 : 0x4910;
    for (const position of [first, second]) {
      const palette = position === 0x4910 ? 0x4915 : 0x492d;
      m.set(m.subarray(palette, palette + 24), 0x405f + m[position]);
    }
  }

  animateSprites() {
    const m = this.memory;
    for (let sprite = 0; sprite < 8; sprite++) {
      m[0x7f8 + sprite] = m[0x458a + sprite * 66 + m[0x43dd]];
    }
    m[0x43dd] = (m[0x43dd] + 1) % 66;
    const color = m[0x479a + m[0x43dd]];
    this.io.fill(color, 0x878, 0x8c8);
    if (color !== 16) {
      return;
    }
    let offset = m[0x4580 + m[0x4589]];
    if (offset === 255) {
      m[0x4589] = 0;
      if (m[0x4588] === 0) {
        m[0x4588] = 1;
        offset = m[0x4580];
      } else {
        m[0x4588] = 0;
        m.fill(32, 0x478, 0x4c8);
        return;
      }
    }
    const source = (m[0x4588] === 0 ? 0x2a00 : 0x2b00) + offset;
    for (let column = 0; column < 40; column++) {
      m[0x478 + column] = m[source + column];
      m[0x4a0 + column] = m[source + column] + 64;
    }
    m[0x4589]++;
  }

}


export class InfiltratorModel extends DemoModel {

  step() {
    const m = this.memory;
    this.ready(0x7096, 2);
    for (let column = 0; column < 40; column++) {
      const color = m[0x7505 + column];
      for (const address of [0x850, 0x877, 0x89e, 0x8c5, 0x8ee, 0x917, 0x940]) {
        this.io[address + column] = color;
      }
      this.io[0xa80 + column] = m[0x7505];
      this.io[0xb20 + column] = m[0x7505];
      this.io[0xb48 + column] = m[0x7505];
    }
    this.rotateLeft(0x7505, 40);
    if (this.ready(0x7145, 2)) {
      this.rotateLeft(0x70ee, 24);
      this.rotateRight(0x71b0, 24);
      this.typeCredit();
    }
    this.scroll();
    this.bounceBars();
    this.animateSprites();
    this.io[0x016] = 0xc8;
    this.io[0x018] = (this.io[0x018] & 0xf0) | 10;
    this.frame++;
  }

  scroll() {
    const m = this.memory;
    m[0x72bc]--;
    if (m[0x72bc] !== 0xbf) {
      return;
    }
    m[0x72bc] = 0xc7;
    m.copyWithin(0x720, 0x721, 0x749);
    for (let column = 0; column < 40; column++) {
      m[0x748 + column] = m[0x749 + column] | 0x80;
    }
    const value = m[this.textPointer];
    if (value === 0x1e) {
      m[0x7355] = 1;
    } else if (value === 0) {
      this.textPointer = 0x3400;
    } else {
      m[0x747] = value;
      m[0x76f] = value;
      this.textPointer++;
    }
  }

  bounceBars() {
    const m = this.memory;
    m.set(m.subarray(0x745e, 0x748e), 0x72bd);
    const first = m[0x749a] === 1;
    for (let index = first ? 7 : 0; first ? index > 0 : index < 8; index += first ? -1 : 1) {
      const target = m[0x7496] + (first ? index - 7 : index);
      m[0x72bd + target] = m[0x744e + index];
    }
    if (m[0x7496] === (first ? 8 : 40)) {
      m[0x749a] = first ? 0 : 1;
    } else {
      m[0x7496] += first ? -1 : 1;
    }
    const second = m[0x749b] !== 0;
    for (let index = second ? 8 : 0; second ? index > 0 : index < 8; index += second ? -1 : 1) {
      const target = m[0x7497] + (second ? index - 8 : index);
      m[0x72bd + target] = m[0x7456 + index];
    }
    if (m[0x7497] === (second ? 8 : 40)) {
      m[0x749b] = second ? 0 : 1;
    } else {
      m[0x7497] += second ? -1 : 1;
    }
  }

  typeCredit() {
    const m = this.memory;
    const count = m[0x76c6];
    if (count === 255) {
      m[0x76c6] = 0;
      m[0x76c5] = 0;
    } else if ([0x40, 0x90, 0xd0].includes(count)) {
      m[0x68d + m[0x76c8]] = m[0x6000 + m[0x76c5]];
      if (m[0x76c8] === 11) {
        m[0x76c8] = 0;
        m[0x76c6]++;
      } else {
        m[0x76c5]++;
        m[0x76c8]++;
      }
    } else {
      m[0x76c6]++;
    }
  }

  animateSprites() {
    const m = this.memory;
    if (this.ready(0x75b1, 8)) {
      m[0x75af]++;
      m[0x7f8] = m[0x75af];
      if (m[0x75af] === 0x83) {
        m[0x75af] = 0x80;
      }
    }
    if (this.ready(0x75b2, 8)) {
      m[0x75b0]++;
      m[0x7f9] = m[0x75b0];
      m[0x7fa] = m[0x75b0];
      if (m[0x75b0] === 0x8b) {
        m[0x75b0] = 0x86;
      }
    }
    const high = m[0x75ff] === 1;
    if (m[0x7600] === (high ? 0x60 : 255)) {
      m[0x75ff] = high ? 0 : 1;
      m[0x7600] = 0;
      this.io[0x010] = high ? 0 : 1;
      if (high) {
        this.io[0] = 0;
      }
    } else {
      m[0x7600]++;
      this.io[0] = m[0x7600];
    }
  }

}
