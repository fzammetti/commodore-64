# NewAge Intro — Phaser reconstruction

A native JavaScript reconstruction of the intro Fantasy wrote for NewAge's release of
Genius (April 1988), from `RIP1_Genius_NWA.d64`. Phaser 3.88.2 presents the recovered
384 × 247 NTSC display. The browser does not run a C64 emulator. The original logo,
character set, texts, scroll text and music are preserved. The game is not converted:
any key leaves the intro as on the C64, and the reconstruction stops where the game
would start.

Timing uses **NTSC: 1,022,730 Hz, 65 cycles × 263 lines, about 59.826 frames/s**.

## How it works

The disk holds one packed program. Its decruncher calls `$1c00`, which blacks out the
colour of the logo rows, points the scroll text at `$1800`, initialises the music
(`$0810`) and the raster IRQ (`$0f00`), and then runs the main loop at `$1e20` forever.

- The **main loop** isn't tied to the frame. It waits in a delay loop of 8 × 255 `DEX`,
  then rewrites and rotates the colours of the text rows: row 21 (the scroll text), rows
  10–18 and rows 22–24. Then it checks the keyboard buffer. One round takes about 2.3
  frames, and the IRQs break into it wherever it happens to be.
- **Line 58, `$1cc9`:** forty raster bars over the logo, one every 75 cycles. Each bar sets
  the background, the border and the X scroll from three tables, so the bars run
  diagonally and the logo wobbles. The logo is drawn in reversed characters in black, so
  the background bars show through its letters. Every other frame the scroll and border
  tables rotate. Then the music player (`$08cf`) runs, followed by the KERNAL's IRQ
  handler (jiffy clock and keyboard scan).
- **Line 218, `$1c2d`:** row 21's fine scroll (38 columns, two pixels a frame). Every
  fourth frame the row moves a character left.
- **Line 234, `$1c5f`:** back to 40 columns.

`intro-model.js` translates all of this onto a modelled bus. Every instruction is listed
as its read and write cycles. On badlines a read in cycles 12–54 waits until cycle 55. The
IRQ is polled in the second-to-last cycle of an instruction, and in the first cycle of a
taken branch that stays on its page. So the main loop's progress, the IRQs' entry cycles,
the bars' register writes and the colour stores all fall on the cycles VICE runs them.

`music.js` translates the player. Its three voices have unrelated pattern lengths, so the
tune doesn't repeat for a very long time. The translation also gives the bus cycles of
each call. Voice 1's order pointer comes from a stray `STA $0D64` with whatever was left in
A, and its notes come from `$0101` (decruncher leftovers in the stack page) and `$12d1`.
The SID writes match VICE on every frame compared. Audio plays through the bundled SID
approximation.

`display.js` draws each frame from the state at line 28 and the timed writes. A colour
register written in cycle *c* shows from pixel (*c* − 14) × 8 + 9.

## Fidelity

Compared with VICE 3.x (x64sc, NTSC, borders "normal"):

- The model's IRQ timing matches VICE's trace on all 560,030 marks over 140,008 frames
  (39 minutes). Its stores match on all 112,685 compared over 300 frames.
- Rendered frames match VICE screenshots pixel for pixel outside the bars, checked on
  24 intro frames up to frame 59,000 and on two exits followed frame by frame (one
  with the IOINIT burst). Inside the bar band (and the IOINIT burst) the only
  differences are the cleaned-up border and X scroll described above; without that
  change those frames matched VICE exactly as well.
- All 30 traced exits agree on hanging or reaching the game.

Not modelled: the extra KERNAL time while a key is held down (a few hundred cycles in
the frames before the main loop sees the key), and the game. Analog SID sound is
approximated.

`analysis/intro.asm` is an annotated disassembly of the intro's code.
