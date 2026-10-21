// Native translations of the second part's sprite/text, color and bounce routines.
// RAM addresses retain the original mutable counters for comparison with the PRG.
const SPRITE_CHAIN = [0x09c2, 0x09c1, 0x09c0, 0x0982, 0x0981, 0x0980,
  0x0942, 0x0941, 0x0940, 0x0902, 0x0901, 0x0900,
  0x08c2, 0x08c1, 0x08c0, 0x0882, 0x0881, 0x0880,
  0x0842, 0x0841, 0x0840, 0x0802, 0x0801, 0x0800];

function capture(input, size, name) {
  const bytes = new Uint8Array(input);
  if (bytes.length !== size) throw new Error(`${name} must contain ${size} bytes.`);
  return bytes.slice();
}

export class PageTwoModel {
  constructor(memory, io) {
    this.memory = capture(memory, 65536, 'RAM');
    this.io = capture(io, 4096, 'I/O');
    this.frame = 0;
    this.previousSpriteMemory = this.memory.slice(0x0800, 0x0a00);
    this.spriteUpdateRaster = 186;
    this.spriteWriteRasters = new Float64Array(512).fill(-Infinity);
    this.previousSpriteY = this.io[1];
  }

  get pattern() { return this.memory[0x2656]; }

  // The original copies X=$00..$FE in each page, then fills only three $xxFFs.
  // In particular, $DBFF retains its old color when the keyboard pattern changes.
  setPattern(pattern) {
    if (![1, 2, 3].includes(pattern)) throw new Error('Pattern must be 1, 2 or 3.');
    if (this.pattern === pattern) return;
    const memory = this.memory;
    const source = [0, 0x2000, 0x3000, 0x3400][pattern];
    memory[0x2656] = pattern;
    for (let offset = 0; offset < 255; offset++) {
      for (let page = 0; page < 4; page++) {
        this.io[0x800 + page * 256 + offset] = memory[source + page * 256 + offset];
      }
    }
    for (let page = 0; page < 3; page++) {
      this.io[0x8ff + page * 256] = memory[source + page * 256 + 255];
    }
    memory[0x26d0] = 255;
  }

  swapScratchPointer() {
    const memory = this.memory;
    const low = memory[0xb0], high = memory[0xb1];
    memory[0xb0] = memory[0x25dc]; memory[0xb1] = memory[0x25dd];
    memory[0x25dc] = low; memory[0x25dd] = high;
  }

  readTextChunk() {
    const memory = this.memory;
    let pointer = memory[0x25d6] | memory[0x25d7] << 8;
    memory[0xb0] = pointer & 255; memory[0xb1] = pointer >> 8;
    for (let character = 0; character < 3; character++) {
      const value = memory[pointer];
      if (!value) {
        // A terminator returns immediately: any remaining chunk characters stay
        // from the previous insertion, exactly as the branch to $25B2 does.
        memory[0x25d6] = 0; memory[0x25d7] = 0x0c;
        return;
      }
      memory[0x25d8 + character] = value;
      pointer = (pointer + 1) & 65535;
      memory[0xb0] = pointer & 255; memory[0xb1] = pointer >> 8;
    }
    memory[0x25d6] = pointer & 255; memory[0x25d7] = pointer >> 8;
  }

  insertCharacters() {
    const memory = this.memory;
    this.swapScratchPointer();
    this.readTextChunk();
    // Each insertion writes three glyph columns across eight sprite rows.
    // Font indices are the recovered C64 screen codes, rather than Unicode.
    for (let character = 0; memory[0x25db] !== 3; character++) {
      const font = (0x2800 + memory[0x25d8 + character] * 8) & 65535;
      memory[0xb0] = font & 255; memory[0xb1] = font >> 8;
      for (let row = 0; row < 8; row++) {
        memory[0x09c0 + memory[0x25db] + row * 3] = memory[(font + row) & 65535];
      }
      memory[0x25db]++;
    }
    memory[0x25db] = 0;
    this.swapScratchPointer();
  }

  scrollSprites() {
    const memory = this.memory;
    // Approximate KERNAL interrupt entry plus the handler's two JSRs/setup.
    // Individual write times retain the original 7-cycle absolute-X ROLs.
    // VIC sprite DMA and bad-line steals are the remaining timing uncertainty.
    let cycles = 38 + 22;
    for (let row = 0; row < 8; row++) {
      let carry = 0;
      for (const base of SPRITE_CHAIN) {
        const address = base + row * 3;
        const value = memory[address];
        memory[address] = ((value << 1) | carry) & 255;
        carry = value >> 7;
        cycles += 7;
        this.spriteWriteRasters[address - 0x0800] = this.spriteUpdateRaster + cycles / 65;
      }
      cycles += 11; // INX three times, CPX and the taken row branch.
    }
    memory[0x24e2] = (memory[0x24e2] + 1) & 255;
    if (memory[0x24e2] === 24) {
      memory[0x24e2] = 0;
      this.insertCharacters();
      // Insertions run after the shift chain. Assign their writes a conservative
      // completion raster; the next display pass uses the complete glyph data.
      for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 3; column++) {
          this.spriteWriteRasters[0x1c0 + row * 3 + column] = this.spriteUpdateRaster + (cycles + 800) / 65;
        }
      }
    }
  }

  cycleColors() {
    const memory = this.memory;
    if (memory[0x2600] === 4) {
      memory[0x2600] = 0;
      for (let offset = 0x800; offset < 0xc00; offset++) this.io[offset] = (this.io[offset] + 1) & 255;
    } else memory[0x2600] = (memory[0x2600] + 1) & 255;
  }

  bounceSprites() {
    const memory = this.memory;
    const down = memory[0x274c] !== 0;
    const y = memory[0x274d] = (memory[0x274d] + (down ? 1 : -1)) & 255;
    if (y === (down ? 232 : 52)) memory[0x274c] = memory[0x274c] === 1 ? 0 : 1;
    for (let sprite = 0; sprite < 8; sprite++) this.io[sprite * 2 + 1] = y;
  }

  step() {
    this.previousSpriteMemory.set(this.memory.subarray(0x0800, 0x0a00));
    this.previousSpriteY = this.io[1];
    this.spriteWriteRasters.fill(-Infinity);
    this.scrollSprites();
    this.cycleColors();
    this.bounceSprites();
    this.frame++;
  }
}
