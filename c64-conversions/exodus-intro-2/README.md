# Exodus Intro #2 — Phaser reconstruction

A native JavaScript reconstruction of "Intro #2", the Commodore 64 intro Fantasy wrote for
Exodus (XDS) "in one day on 11/24/88". Phaser 3.88.2 presents the recovered 384 × 247 NTSC
display. The browser does not run a C64 emulator. The original logos, character sets, texts,
scroll text and music are preserved.

Timing uses **NTSC: 1,022,730 Hz, 65 cycles × 263 lines, about 59.826 frames/s**.

## How it works

The XDS-packed program unpacks to a setup at `$0c00`. It blocks RUN/STOP-RESTORE, blacks
out the screen, initialises the music at `$1000` and the intro at `$1800`, then idles in a
`JMP $0c20` loop. Three raster IRQs do the rest:

- `$183e` (line 82) changes the background on every line for 16 lines behind the upper
  "EXODUS" logo (rows 4 and 5) and sets its fine scroll. Every fourth frame its 24 colours
  rotate.
- `$1ad5` (line 138) colours border and background for 24 lines behind the scroller (a
  flash once a second) and switches rows 11–13 to the `$0800` character set. It also cycles
  the colour of "IMPORTED BY EXODUS" and "INTRO BY FANTASY".
- `$196a` (line 202) does the same as `$183e` for the lower logo (rows 19 and 20). It then
  plays the music at `$1006`, colours the scroller, bounces both logos two pixels a frame
  over 24 characters, scrolls the text one pixel a frame and tests SPACE.

`intro-model.js` translates these routines. The line loops take 61 and 60 cycles on a
65-cycle line, so each colour starts four or five cycles earlier than the one above it
until a badline catches up, and the bars slant across the logos. Each IRQ writes its
colours at the cycles VICE (x64sc, NTSC) traced for its entry cycle
(`assets/irq-timing.json`). The idle loop's 3-cycle `JMP` places that entry between cycles
38 and 40, and the rotations in the previous handler's tail decide which one. The display
applies the register writes as the raster passes them; a colour written in cycle *c* shows
from pixel (*c* − 14) × 8 + 9, as in VICE.

## Fidelity

- Model frames match VICE screenshots per colour index, frame for frame, with no search:
  20 frames between frame 60 and frame 6,006 (about 100 seconds) show no mismatched pixels.
  This covers all six phases of the lower bars' entry cycle, the bounces, the scroller and
  the band flash.
- IRQ1's entry cycle follows the music's run time, which is not modelled. It only moves
  writes that land in the border, so the model uses its most common entry (39).
- The music is a SID register capture of 5,763 frames with a verified loop from frame 387
  (5,376 frames, about 90 seconds). Analog SID sound is approximated.
- The project palette is shared with the other conversions. It is not the palette this
  VICE build renders with.
- SPACE runs the original exit, which copies `$2c00`–`$FFFF` to `$0801` and starts BASIC's
  `NEWSTT` directly. The game is not on this disk, so, as in VICE, BASIC prints "READY."
  61 frames later and the cursor starts blinking two frames after that.
