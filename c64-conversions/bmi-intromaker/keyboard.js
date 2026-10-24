// Browser keys to the PETSCII codes the KERNAL keyboard scan would place in its buffer.
// Letters are unshifted (upper case on screen); SHIFT+letter gives the graphic character.

const SPECIAL = {
  Enter: [0x0d, 0x8d], Backspace: [0x14, 0x94], Insert: [0x94, 0x94],
  ArrowRight: [0x1d, 0x9d], ArrowLeft: [0x9d, 0x9d], ArrowDown: [0x11, 0x91], ArrowUp: [0x91, 0x91],
  Home: [0x13, 0x93], Escape: [0x03, 0x83]
};

// CTRL+1-8 colors, CTRL+9/0 reverse on/off; Alt stands in for CTRL, Alt+Shift for C=.
const CONTROL_DIGITS = [0x92, 0x90, 0x05, 0x1c, 0x9f, 0x9c, 0x1e, 0x1f, 0x9e, 0x12];
const COMMODORE_DIGITS = [null, 0x81, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0x9b, null];

// The KERNAL repeats only these keys while they are held.
export const REPEATING = new Set([0x20, 0x14, 0x94, 0x1d, 0x9d, 0x11, 0x91]);

export function petsciiForKey(event) {
  const special = SPECIAL[event.key];
  if (special) return special[event.shiftKey ? 1 : 0];
  if (event.altKey && /^Digit[0-9]$/.test(event.code)) {
    const digit = Number(event.code.slice(5));
    return (event.shiftKey ? COMMODORE_DIGITS : CONTROL_DIGITS)[digit];
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  return petsciiForCharacter(event.key, event.shiftKey);
}

export function petsciiForCharacter(character, shifted = false) {
  if (character.length !== 1) return null;
  const code = character.charCodeAt(0);
  if (/[a-z]/i.test(character)) return (character.toUpperCase().charCodeAt(0)) | (shifted ? 0x80 : 0);
  if (character === '£' || character === '\\') return 0x5c;
  if (character === '^') return 0x5e;
  if (character === '_') return 0x5f;
  if (code >= 0x20 && code <= 0x5d) return code;
  return null;
}
