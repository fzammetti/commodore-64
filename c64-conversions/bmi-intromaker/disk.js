// A virtual 1541 holding PRG files, seeded from the original D64 image. Names are PETSCII
// byte strings; the directory is produced in the drive's BASIC-listing format.

const SECTORS = track => track <= 17 ? 21 : track <= 24 ? 19 : track <= 30 ? 18 : 17;

function sectorOffset(track, sector) {
  let offset = 0;
  for (let t = 1; t < track; t++) offset += SECTORS(t);
  return (offset + sector) * 256;
}

const text = bytes => String.fromCharCode(...bytes);
const bytes = string => Array.from(string, character => character.charCodeAt(0) & 255);

export class VirtualDisk {
  constructor() {
    this.name = 'NEW DISK';
    this.id = '00';
    this.files = [];
    this.listeners = [];
  }

  // Read the header and every closed PRG file of a D64 image.
  static fromD64(buffer) {
    const image = new Uint8Array(buffer);
    const disk = new VirtualDisk();
    const bam = sectorOffset(18, 0);
    const strip = range => text(Array.from(range).filter(value => value !== 0xa0));
    disk.name = strip(image.subarray(bam + 0x90, bam + 0xa0));
    disk.id = strip(image.subarray(bam + 0xa2, bam + 0xa4));
    let track = 18, sector = 1;
    const seen = new Set();
    while (track && !seen.has(`${track}/${sector}`)) {
      seen.add(`${track}/${sector}`);
      const block = sectorOffset(track, sector);
      for (let entry = 0; entry < 8; entry++) {
        const base = block + entry * 32;
        if ((image[base + 2] & 0x87) !== 0x82) continue;
        const chunks = [];
        let fileTrack = image[base + 3], fileSector = image[base + 4];
        for (let guard = 0; fileTrack && guard < 800; guard++) {
          const at = sectorOffset(fileTrack, fileSector);
          const next = image[at];
          chunks.push(image.subarray(at + 2, next ? at + 256 : at + image[at + 1] + 1));
          fileTrack = next;
          fileSector = image[at + 1];
        }
        const data = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
        let offset = 0;
        for (const chunk of chunks) {
          data.set(chunk, offset);
          offset += chunk.length;
        }
        disk.files.push({ name: strip(image.subarray(base + 5, base + 21)), data,
          blocks: image[base + 30] | (image[base + 31] << 8) });
      }
      track = image[block];
      sector = image[block + 1];
    }
    return disk;
  }

  onChange(listener) {
    this.listeners.push(listener);
  }

  changed(file) {
    for (const listener of this.listeners) listener(file);
  }

  // DOS name parsing: an optional drive prefix, then the name up to a comma.
  static parseName(nameBytes) {
    let name = text(nameBytes);
    let replace = false;
    if (name.startsWith('@')) {
      replace = true;
      name = name.slice(1);
    }
    name = name.replace(/^[0-9]?:/, '');
    return { name: name.split(',')[0].slice(0, 16), replace };
  }

  static matches(fileName, pattern) {
    for (let index = 0; index < pattern.length; index++) {
      if (pattern[index] === '*') return true;
      if (pattern[index] !== '?' && pattern[index] !== fileName[index]) return false;
    }
    return fileName.length === pattern.length;
  }

  find(nameBytes) {
    const { name } = VirtualDisk.parseName(nameBytes);
    if (!name) return null;
    return this.files.find(file => VirtualDisk.matches(file.name, name)) || null;
  }

  // A SAVE over an existing name fails with 63, FILE EXISTS unless it starts with @.
  save(nameBytes, data) {
    const { name, replace } = VirtualDisk.parseName(nameBytes);
    if (!name || /[*?]/.test(name)) return null;
    const existing = this.files.findIndex(file => file.name === name);
    if (existing >= 0 && !replace) return null;
    const file = { name, data: new Uint8Array(data), blocks: Math.max(1, Math.ceil(data.length / 254)) };
    if (existing >= 0) this.files[existing] = file;
    else this.files.push(file);
    this.changed(file);
    return file;
  }

  add(name, data) {
    const clean = name.toUpperCase().replace(/[^ -~]/g, '').slice(0, 16) || 'PROGRAM';
    let unique = clean;
    for (let n = 2; this.files.some(file => file.name === unique); n++) unique = `${clean.slice(0, 14)}${n}`;
    const file = { name: unique, data: new Uint8Array(data), blocks: Math.max(1, Math.ceil(data.length / 254)) };
    this.files.push(file);
    this.changed(file);
    return file;
  }

  // The "$" listing as the drive sends it: a BASIC program loaded at $0401.
  directory() {
    const out = [0x01, 0x04];
    const line = (number, content) => out.push(0x01, 0x01, number & 255, number >> 8, ...content, 0);
    const pad = (string, length) => string + ' '.repeat(Math.max(0, length - string.length));
    line(0, [0x12, 0x22, ...bytes(pad(this.name, 16)), 0x22, 0x20, ...bytes(pad(this.id, 2)), 0x20, ...bytes('2A')]);
    let used = 0;
    for (const file of this.files) {
      used += file.blocks;
      const indent = file.blocks < 10 ? 3 : file.blocks < 100 ? 2 : 1;
      line(file.blocks, bytes(' '.repeat(indent) + pad(`"${file.name}"`, 18) + ' PRG  '));
    }
    line(Math.max(0, 664 - used), bytes('BLOCKS FREE.             '));
    out.push(0, 0);
    return new Uint8Array(out);
  }
}
