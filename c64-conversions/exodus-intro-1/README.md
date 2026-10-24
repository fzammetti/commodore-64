# Exodus Intro #1 — Phaser reconstruction

A native JavaScript reconstruction of "Intro #1", the Commodore 64 intro Fantasy wrote for
Exodus (XDS). Phaser 3.88.2 presents the recovered 384 × 247 NTSC display. The browser does
not run a C64 emulator. The original logo, character sets, faces, starfield, texts, scroll
text and music are preserved.

Timing uses **NTSC: 1,022,730 Hz, 65 cycles × 263 lines, about 59.826 frames/s**.

## How it works

The XDS-packed program unpacks to a setup at `$0a00`, four raster IRQs and a main loop:

- `$2833` (line 52) changes the logo's `$d022`/`$d023` colours on every line for 48 lines.
  Its loop takes 70 cycles, so the splits slant across the logo until a badline resets them.
- `$2983` (line 114) and `$2a28` (line 154) draw the two groups of raster bars and cycle the
  colours of the logo and the two text rows.
- `$2b50` (line 225) colours the scroller row, fine-scrolls it, tests SPACE and plays the
  music at `$1704`.
- The main loop rolls eight glyph rows of characters `$41`–`$5a` at different speeds (the
  starfield), waits, and fades "INTRO BY FANTASY!". It is not tied to the frame, so it gets
  whatever CPU time the IRQs and badlines leave.

`intro-model.js` translates all of this. The main loop runs one instruction at a time with
its cycle counts, and badlines halt it for 43 cycles. The instruction in progress when an
IRQ arrives decides the IRQ's entry cycle (38 to 44). Each IRQ then writes its colours at
the cycles VICE (x64sc, NTSC) traced for that entry cycle (`assets/irq-timing.json`). The
display applies these register writes, and the main loop's memory writes, as the raster
passes them.

## Fidelity

- Frames rendered from the model match VICE screenshots per colour index in the logo, bars,
  texts, faces and scroller. The starfield matches one of the model's frames to within a
  few pixels of mid-rotation tearing.
- Main-loop pacing: VICE runs an iteration every 26,084 cycles on average and the model
  every 26,137 (0.2% slower), with the same spread of intervals. The jitter of IRQ entry
  follows the model's main loop, not VICE's exact phase, so stars, the fade and the
  slanted logo splits match in behaviour, not frame for frame.
- The music is a SID register capture of 3,074 frames with a verified loop from frame 2
  (about 51 seconds). Analog SID sound is approximated.
- The project palette is shared with the other conversions. It is not the palette this
  VICE build renders with.
- SPACE runs the original exit, which copies `$4000`–`$FFFF` to `$0801` and RUNs it. The
  game is not on this disk, so, as in VICE, BASIC shows `?SYNTAX  ERROR`.
