import {
  IMPLIED, IMMEDIATE, ZP_READ, ZP_WRITE, ZP_RMW, ABS_READ, ABS_READ_CROSS, ABS_WRITE,
  ABS_INDEXED_WRITE, ABS_RMW, ABS_INDEXED_RMW, INDIRECT_Y, INDIRECT_Y_CROSS, JSR, RTS, JMP,
  BRANCH, BRANCH_TAKEN, PUSH, PULL, POLL_EARLY
} from './bus.js';

// Translation of the music player at $1302. Unlike most intros, this one does not play
// its music from a raster IRQ: the main loop calls the player, then waits in a delay
// loop, so the tune's tempo follows how much time the IRQs leave the main loop. The
// player therefore runs on the model's bus instruction by instruction, and the IRQs
// break into it wherever they fall. SID writes go to `model.sid(clock, register, value)`.
//
// Three voices at X = 0, 7 and 14 share one table layout ($1000-$1047). $1000 enables
// voices (bits from $1020,X; only voices 1 and 2 are on), $1001 is the speed: notes
// advance on every 4th call. Each voice runs its effects every call: a pulse width
// sweep, an octave arpeggio, a pitch slide, two waveform toggles, a portamento and one
// step of vibrato. The order lists start at $167d, $1765 and $17ab, the instruments at
// $13ba (eight bytes each) and the frequency tables at $1048 (high) and $10a8 (low).

// Indexed reads take one cycle more when they cross a page.
const indexed = (base, index) => ((base & 255) + index > 255 ? ABS_READ_CROSS : ABS_READ);
const indirect = (model, y) => (model.memory[0xfb] + y > 255 ? INDIRECT_Y_CROSS : INDIRECT_Y);
const pointer = model => model.memory[0xfb] | (model.memory[0xfc] << 8);

// A taken branch in the main thread polls the IRQ early (it never crosses a page here).
function* taken(model) {
  yield* model.op(BRANCH_TAKEN, POLL_EARLY);
}

// $1302: one call of the player.
export function* play(model) {
  const m = model.memory;
  const fb = m[0xfb], fc = m[0xfc];
  yield* model.op(ZP_READ);
  yield* model.op(PUSH);
  yield* model.op(ZP_READ);
  yield* model.op(PUSH);
  yield* model.op(ABS_RMW);
  m[0x1046] = (m[0x1046] + 1) & 255;
  yield* model.op(IMMEDIATE);
  for (let x = 0; x < 0x15; x += 7) {
    yield* model.op(ABS_READ);
    yield* model.op(ABS_READ);
    let next = false;
    if (m[0x1000] & m[0x1020 + x]) {
      yield* model.op(BRANCH);
      yield* model.op(JSR);
      yield* effects(model, x);
      yield* model.op(ABS_READ);
      yield* model.op(ABS_READ);
      if (m[0x1046] === m[0x1001]) {
        yield* model.op(BRANCH);
        yield* model.op(ABS_INDEXED_RMW);
        m[0x1006 + x] = (m[0x1006 + x] - 1) & 255;
        if (m[0x1006 + x] & 0x80) {
          yield* model.op(BRANCH);
          yield* model.op(JSR);
          yield* nextNote(model, x);
          next = true;
        }
      }
    }
    if (!next) yield* taken(model);
    // $1328: TXA, CLC, ADC #7, TAX, CPX #$15, BNE.
    yield* model.op(IMPLIED);
    yield* model.op(IMPLIED);
    yield* model.op(IMMEDIATE);
    yield* model.op(IMPLIED);
    yield* model.op(IMMEDIATE);
    if (x + 7 < 0x15) yield* taken(model);
    else yield* model.op(BRANCH);
  }
  yield* model.op(ABS_READ);
  yield* model.op(ABS_READ);
  if (m[0x1046] === m[0x1001]) {
    yield* model.op(BRANCH);
    yield* model.op(IMMEDIATE);
    yield* model.op(ABS_WRITE);
    m[0x1046] = 0;
  } else yield* taken(model);
  yield* model.op(PULL);
  yield* model.op(ZP_WRITE);
  m[0xfc] = fc;
  yield* model.op(PULL);
  yield* model.op(ZP_WRITE);
  m[0xfb] = fb;
  yield* model.op(RTS);
}

// $1159: set voice X's note to Y (its index into the frequency tables) and remember it
// at $101C,X.
function* setNote(model, x, y) {
  const m = model.memory;
  yield* model.op(IMPLIED);
  yield* model.op(ABS_INDEXED_WRITE);
  m[0x101c + x] = y;
  yield* model.op(indexed(0x1048, y));
  model.sid(yield* model.op(ABS_INDEXED_WRITE), 0x01 + x, m[0x1048 + y]);
  yield* model.op(ABS_INDEXED_WRITE);
  m[0x1033 + x] = m[0x1048 + y];
  yield* model.op(indexed(0x10a8, y));
  model.sid(yield* model.op(ABS_INDEXED_WRITE), 0x00 + x, m[0x10a8 + y]);
  yield* model.op(ABS_INDEXED_WRITE);
  m[0x1032 + x] = m[0x10a8 + y];
  yield* model.op(RTS);
}

// $124b: the effects voice X runs on every call. The flags at $100A,X select them.
function* effects(model, x) {
  const m = model.memory;
  // The pulse width rises by $101A,X.
  yield* model.op(ABS_READ);
  yield* model.op(IMPLIED);
  yield* model.op(ABS_READ);
  const low = m[0x1034 + x] + m[0x101a + x];
  yield* model.op(ABS_INDEXED_WRITE);
  m[0x1034 + x] = low & 255;
  model.sid(yield* model.op(ABS_INDEXED_WRITE), 0x02 + x, low & 255);
  yield* model.op(ABS_READ);
  yield* model.op(IMMEDIATE);
  const high = (m[0x1035 + x] + (low >> 8)) & 255;
  yield* model.op(ABS_INDEXED_WRITE);
  m[0x1035 + x] = high;
  model.sid(yield* model.op(ABS_INDEXED_WRITE), 0x03 + x, high);
  const flags = m[0x100a + x];
  yield* model.op(ABS_READ);
  yield* model.op(IMPLIED);
  yield* model.op(PUSH);
  // Bit 0: the note alternates an octave up and down (and $101C,X with it).
  if (flags & 1) {
    yield* model.op(BRANCH);
    yield* model.op(ABS_READ);
    yield* model.op(IMMEDIATE);
    yield* model.op(ABS_INDEXED_WRITE);
    m[0x100b + x] ^= 0x80;
    if (m[0x100b + x]) yield* taken(model);
    else yield* model.op(BRANCH);
    yield* model.op(ABS_READ);
    yield* model.op(IMPLIED);
    yield* model.op(IMMEDIATE);
    yield* model.op(IMPLIED);
    yield* model.op(JSR);
    if (m[0x100b + x]) yield* setNote(model, x, (m[0x101c + x] - 12) & 255);
    else {
      yield* setNote(model, x, (m[0x101c + x] + 12) & 255);
      yield* model.op(IMPLIED);
      yield* taken(model);
    }
  } else yield* taken(model);
  // Bit 1: the note slides down a step each call.
  yield* model.op(PULL);
  yield* model.op(IMPLIED);
  yield* model.op(PUSH);
  if (flags & 2) {
    yield* model.op(BRANCH);
    yield* model.op(ABS_READ);
    yield* model.op(IMPLIED);
    yield* model.op(JSR);
    yield* setNote(model, x, (m[0x101c + x] - 1) & 255);
  } else yield* taken(model);
  // Bits 2 and 3 toggle waveform bits through $1031,X and $1030,X.
  yield* model.op(PULL);
  yield* model.op(IMPLIED);
  yield* model.op(PUSH);
  if (flags & 4) {
    yield* model.op(BRANCH);
    yield* model.op(ABS_READ);
    yield* model.op(IMMEDIATE);
    yield* model.op(ABS_INDEXED_WRITE);
    m[0x1031 + x] ^= 0xc0;
    model.sid(yield* model.op(ABS_INDEXED_WRITE), 0x04 + x, m[0x1031 + x]);
  } else yield* taken(model);
  yield* model.op(PULL);
  yield* model.op(IMPLIED);
  if (flags & 8) {
    yield* model.op(BRANCH);
    yield* model.op(ABS_READ);
    yield* model.op(IMMEDIATE);
    yield* model.op(ABS_INDEXED_WRITE);
    m[0x1030 + x] ^= 0x60;
    model.sid(yield* model.op(ABS_INDEXED_WRITE), 0x04 + x, m[0x1030 + x]);
  } else yield* taken(model);
  // $12b6: portamento by $1005,X, up when bit 4 is set.
  const step = m[0x1005 + x];
  yield* model.op(ABS_READ);
  if (step) {
    yield* model.op(BRANCH);
    yield* model.op(ABS_WRITE);
    m[0x1047] = step;
    yield* model.op(ABS_READ);
    yield* model.op(IMMEDIATE);
    if (flags & 0x10) {
      yield* model.op(BRANCH);
      yield* model.op(ABS_READ);
      yield* model.op(IMPLIED);
      yield* model.op(ABS_READ);
      yield* model.op(ABS_INDEXED_WRITE);
      const sum = m[0x1032 + x] + step;
      m[0x1032 + x] = sum & 255;
      if (sum > 255) {
        yield* model.op(BRANCH);
        yield* model.op(ABS_INDEXED_RMW);
        m[0x1033 + x] = (m[0x1033 + x] + 1) & 255;
      } else yield* taken(model);
      yield* model.op(IMPLIED);
      yield* taken(model);
    } else {
      yield* taken(model);
      yield* model.op(ABS_READ);
      yield* model.op(IMPLIED);
      yield* model.op(ABS_READ);
      yield* model.op(ABS_INDEXED_WRITE);
      const difference = m[0x1032 + x] - step;
      m[0x1032 + x] = difference & 255;
      if (difference < 0) {
        yield* model.op(BRANCH);
        yield* model.op(ABS_INDEXED_RMW);
        m[0x1033 + x] = (m[0x1033 + x] - 1) & 255;
      } else yield* taken(model);
    }
  } else yield* taken(model);
  // $12e6: meant as a loop of four vibrato steps, but it lacks the branch back: one step.
  yield* model.op(IMMEDIATE);
  yield* model.op(IMPLIED);
  yield* model.op(IMPLIED);
  yield* model.op(IMMEDIATE);
  yield* model.op(BRANCH);
  yield* model.op(IMPLIED);
  yield* model.op(PUSH);
  yield* model.op(JSR);
  yield* vibrato(model, x);
  yield* model.op(PULL);
  yield* model.op(IMPLIED);
  // $12f5: the frequency to the SID.
  yield* model.op(ABS_READ);
  model.sid(yield* model.op(ABS_INDEXED_WRITE), 0x00 + x, m[0x1032 + x]);
  yield* model.op(ABS_READ);
  model.sid(yield* model.op(ABS_INDEXED_WRITE), 0x01 + x, m[0x1033 + x]);
  yield* model.op(RTS);
}

// $1229: one step through 16 vibrato offsets at $1108 + $1009,X, added to the
// frequency's low byte.
function* vibrato(model, x) {
  const m = model.memory;
  yield* model.op(ABS_INDEXED_RMW);
  m[0x1008 + x] = (m[0x1008 + x] + 1) & 255;
  yield* model.op(ABS_READ);
  yield* model.op(IMPLIED);
  yield* model.op(ABS_READ);
  const y = (m[0x1008 + x] + m[0x1009 + x]) & 255;
  yield* model.op(IMPLIED);
  yield* model.op(indexed(0x1108, y));
  yield* model.op(IMPLIED);
  yield* model.op(ABS_READ);
  yield* model.op(ABS_INDEXED_WRITE);
  m[0x1032 + x] = (m[0x1032 + x] + m[0x1108 + y]) & 255;
  yield* model.op(ABS_READ);
  yield* model.op(IMMEDIATE);
  if (m[0x1008 + x] === 0x10) {
    yield* model.op(BRANCH);
    yield* model.op(IMMEDIATE);
    yield* model.op(ABS_INDEXED_WRITE);
    m[0x1008 + x] = 0;
  } else yield* taken(model);
  yield* model.op(RTS);
}

// $1170: voice X's next note. The order list at ($101E,X) holds pattern addresses, high
// byte 0 to repeat the list and 1 to stop the music; a pattern holds pairs of note and
// (instrument << 5 | duration), ending with note 0.
function* nextNote(model, x) {
  const m = model.memory;
  for (;;) {
    yield* model.op(ABS_READ);
    yield* model.op(ZP_WRITE);
    m[0xfb] = m[0x101e + x];
    yield* model.op(ABS_READ);
    yield* model.op(ZP_WRITE);
    m[0xfc] = m[0x101f + x];
    yield* model.op(ABS_READ);
    yield* model.op(IMPLIED);
    yield* model.op(IMPLIED);
    let y = ((m[0x101d + x] << 1) + 1) & 255;
    yield* model.op(IMPLIED);
    yield* model.op(indirect(model, y));
    let high = m[(pointer(model) + y) & 0xffff];
    yield* model.op(IMMEDIATE);
    if (!high) {
      yield* model.op(BRANCH);
      yield* model.op(IMMEDIATE);
      yield* model.op(ABS_INDEXED_WRITE);
      m[0x101d + x] = 0;
      y = 1;
      yield* model.op(IMMEDIATE);
      yield* model.op(indirect(model, y));
      high = m[(pointer(model) + y) & 0xffff];
      yield* model.op(IMPLIED);
      yield* taken(model);
    } else {
      yield* taken(model);
      yield* model.op(IMMEDIATE);
      if (high === 1) {
        yield* model.op(BRANCH);
        yield* model.op(IMMEDIATE);
        yield* model.op(ABS_WRITE);
        m[0x1000] = 0;
        yield* model.op(RTS);
        return;
      }
      yield* taken(model);
    }
    // $119c: the pattern's address.
    yield* model.op(PUSH);
    y--;
    yield* model.op(IMPLIED);
    yield* model.op(indirect(model, y));
    const low = m[(pointer(model) + y) & 0xffff];
    yield* model.op(ZP_WRITE);
    m[0xfb] = low;
    yield* model.op(PULL);
    yield* model.op(ZP_WRITE);
    m[0xfc] = high;
    yield* model.op(ABS_READ);
    y = m[0x102f + x];
    yield* model.op(IMPLIED);
    yield* model.op(IMPLIED);
    yield* model.op(IMMEDIATE);
    yield* model.op(ABS_INDEXED_WRITE);
    m[0x102f + x] = (y + 2) & 255;
    yield* model.op(indirect(model, y));
    const note = m[(pointer(model) + y) & 0xffff];
    yield* model.op(IMMEDIATE);
    if (note) {
      yield* taken(model);
      yield* model.op(ABS_INDEXED_WRITE);
      m[0x101c + x] = note;
      y = (y + 1) & 255;
      yield* model.op(IMPLIED);
      yield* model.op(indirect(model, y));
      const value = m[(pointer(model) + y) & 0xffff];
      yield* model.op(PUSH);
      yield* model.op(IMMEDIATE);
      yield* model.op(ABS_INDEXED_WRITE);
      m[0x1006 + x] = value & 0x1f;
      yield* model.op(PULL);
      yield* model.op(IMMEDIATE);
      yield* model.op(IMPLIED);
      yield* model.op(IMPLIED);
      y = (value & 0xe0) >> 2;
      yield* model.op(IMPLIED);
      yield* instrument(model, x, y);
      return;
    }
    yield* model.op(BRANCH);
    yield* model.op(IMMEDIATE);
    yield* model.op(ABS_INDEXED_WRITE);
    m[0x102f + x] = 0;
    yield* model.op(ABS_INDEXED_RMW);
    m[0x101d + x] = (m[0x101d + x] + 1) & 255;
    yield* model.op(JMP);
  }
}

// $11d2: the instrument at ($1002) + Y sets the pulse width, portamento, waveform,
// envelope, pulse sweep, vibrato table and effect flags; then the note starts.
function* instrument(model, x, y) {
  const m = model.memory;
  yield* model.op(ABS_READ);
  yield* model.op(ZP_WRITE);
  m[0xfb] = m[0x1002];
  yield* model.op(ABS_READ);
  yield* model.op(ZP_WRITE);
  m[0xfc] = m[0x1003];
  yield* model.op(IMMEDIATE);
  model.sid(yield* model.op(ABS_INDEXED_WRITE), 0x04 + x, 0);
  model.sid(yield* model.op(ABS_INDEXED_WRITE), 0x02 + x, 0);
  yield* model.op(ABS_INDEXED_WRITE);
  m[0x1034 + x] = 0;
  const read = function* () {
    yield* model.op(indirect(model, y));
    const value = m[(pointer(model) + y) & 0xffff];
    y = (y + 1) & 255;
    yield* model.op(IMPLIED);
    return value;
  };
  const pulse = yield* read();
  model.sid(yield* model.op(ABS_INDEXED_WRITE), 0x03 + x, pulse);
  yield* model.op(ABS_INDEXED_WRITE);
  m[0x1035 + x] = pulse;
  yield* model.op(IMMEDIATE);
  yield* model.op(ABS_INDEXED_WRITE);
  m[0x1005 + x] = pulse & 0xf0;
  const control = yield* read();
  yield* model.op(ABS_INDEXED_WRITE);
  m[0x1007 + x] = control;
  const attack = yield* read();
  model.sid(yield* model.op(ABS_INDEXED_WRITE), 0x05 + x, attack);
  const sustain = yield* read();
  model.sid(yield* model.op(ABS_INDEXED_WRITE), 0x06 + x, sustain);
  const sweep = yield* read();
  yield* model.op(ABS_INDEXED_WRITE);
  m[0x101a + x] = sweep;
  const table = yield* read();
  yield* model.op(ABS_INDEXED_WRITE);
  m[0x1009 + x] = table;
  yield* read();
  const flags = yield* read();
  yield* model.op(ABS_INDEXED_WRITE);
  m[0x100a + x] = flags;
  yield* model.op(ABS_READ);
  yield* model.op(JSR);
  yield* setNote(model, x, m[0x101c + x]);
  yield* model.op(ABS_READ);
  model.sid(yield* model.op(ABS_INDEXED_WRITE), 0x04 + x, m[0x1007 + x]);
  yield* model.op(RTS);
}
