# Exodus Intro #3 — Phaser reconstruction

A native JavaScript reconstruction of "Intro #3" ("INTRO #3-DEMO"), the Commodore 64 intro
Fantasy wrote for Exodus (XDS). Phaser 3.88.2 presents the recovered 384 × 247 NTSC display.
The browser does not run a C64 emulator. The original character set, sprites, texts, both
scroll texts and the music are preserved.

Timing uses **NTSC: 1,022,730 Hz, 65 cycles × 263 lines, about 59.826 frames/s**.

## How it works

The packed program unpacks to `$0a00`. That code blocks RUN/STOP-RESTORE, blacks out the
screen, copies the screen from `$2000`, colours rows 21–24 dark grey and enables six
sprites ("EXODUS", data at `$0800`). It then calls `$3000` and polls SPACE in an 11-cycle
loop at `$0aa8`. Two raster IRQs do the rest:

- `$302a` (line 162) changes the background on every line for 24 lines from `$30cf` and
  sets the upper scroller's fine scroll. The scroller's letters are holes in solid
  characters, so the bars show through them. It then scrolls the text at `$2400` two
  pixels a frame and, every third frame, rotates the six sprite colours.
- `$31a7` (line 218) sets the fine scroll of row 21, a mountain range drawn with the
  characters "A" to "Z", which moves one pixel a frame. It then plays the music at `$1067`
  (the player's init is never called), moves the sprites along sine curves (`$0c2d`), and
  every third frame rotates the bar colours. Every fourth frame it cycles the colour of
  "IMPORTED BY" and "EXODUS". Finally it tests SPACE.

`intro-model.js` translates these routines. The bar loop takes 60 cycles on a 65-cycle
line, so each colour starts five cycles earlier than the one above it until a badline
catches up, and the bars slant. Each IRQ writes its registers at the cycles VICE (x64sc,
NTSC) traced for its entry cycle (`assets/irq-timing.json`). The display applies the
register writes as the raster passes them, and a colour written in cycle *c* shows from
pixel (*c* − 14) × 8 + 9, as in VICE.

The entry cycle (38 to 41) depends on where the SPACE loop is when the IRQ arrives, and so
on every cycle spent by the handlers, the music, badlines and sprite DMA since the intro
started. Its sequence has no short period, and it moves the bar edges inside the letters by
up to 24 pixels a frame. `assets/irq-entries.json` holds both IRQs' entries as VICE traced
them for the first 36,057 frames (about ten minutes). After that the sequence repeats.
