# Lethal Intro — Phaser reconstruction

A native JavaScript reconstruction of the "make-shift intro" Fantasy wrote for Lethal's
crack of New Barbarian II. Phaser 3.88.2 presents the
recovered 384 × 247 NTSC display. The browser does not run a C64 emulator. The original
character set, texts, scroll text and music are preserved. The game is not converted: SPACE
leaves the intro as on the C64, and the reconstruction stops where the game would start.

Timing uses **NTSC: 1,022,730 Hz, 65 cycles × 263 lines, about 59.826 frames/s**.

## How it works

The disk holds one packed program. Its decruncher calls `$1800`, which clears the screen,
colours rows 12 and 13 black, selects the character set at `$2000` and the screen at `$2800`,
initialises the music (`$1000`) and the raster IRQ (`$0800`), then idles in a 9-cycle loop
at `$1833` that reads the keyboard but never branches. One raster IRQ, at line 146 through
the KERNAL's `$0314` vector, does all the work:

- `$0827` sets row 12's fine scroll (38 columns) and writes eight lines of border and
  background colour from `$08fb` and `$08e3`. The scroll text consists of reversed
  characters in black, so the background bars show through the letters and the border
  bars run out to the screen edges as a line.
- `$0885` scrolls the text at `$1a00` one pixel a frame.
- `$0903` rotates the 24 background colours every fourth frame, and `$0930` steps the
  white border line through the bars every third frame, reversing after six steps.
- `$0cd3` is the starfield. The screen is filled with the characters "A" to "Z", and
  each of the eight pixel rows of their glyphs forms a 208-pixel ring that `ROL` moves
  left by 3, 4, 2, 0, 5, 1, 7 and 6 pixels a frame.
- `$1006` plays the music, and `$09a9` tests SPACE and jumps to `$1900`.

`intro-model.js` translates these routines. The starfield runs from about line 157 to
line 250, while the lower half of the screen is drawn, so stars there move during the
frame. The model counts every bus cycle of the IRQ, including the badlines' stalls, and
gives each glyph store its cycle. The display reads a column's glyph in cycle 15 + n, as
the VIC-II does. The bar colours change mid-line at the cycles VICE traced for each entry
cycle (`assets/irq-timing.json`). A colour written in cycle *c* shows from pixel
(*c* − 14) × 8 + 9.

The IRQ's entry cycle (38 to 41) depends on where the idle loop is when the IRQ arrives,
and so on every cycle spent since the intro started. The sequence has no short period.
`assets/irq-entries.json` holds the entries as VICE traced them for the first 40,641
frames (about 11 minutes). After that the sequence repeats. `assets/play-cycles.bin`
holds the cycles each music call takes, so the SPACE test lands on the right cycle.

SPACE runs `$1900`: IOINIT, RESTOR and CINT (light blue border, blue screen), a second
screen clear, then a copy of `$2c00`–`$FFFF` to `$0801` and RUN. `exit-model.js` replays the
KERNAL's traced writes and holds the blue screen where New Barbarian II would start.

`analysis/intro.asm` is an annotated disassembly of the intro's code.

## Fidelity

Frames rendered by the model match VICE (x64sc, NTSC, borders "normal") screenshots pixel
for pixel. That covers 32 frames spread over the first 40,000, including the first frame,
on which the setup is still switching screens, and two exits followed for 30 frames. The
model's instruction clocks agree with VICE's trace on all 862 frames compared, and its
starfield stores agree on all 14,583 compared. The music is a SID register capture of the
player with a verified loop (5,376 frames from frame 387). Analog SID sound is
approximated. After SPACE, IOINIT turns the SID's volume to zero, so the sound stops there too.
