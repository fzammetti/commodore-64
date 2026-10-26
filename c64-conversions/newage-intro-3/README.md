# NewAge Psynus Intro — Phaser reconstruction

A native JavaScript reconstruction of the intro Fantasy wrote for NewAge's release of
Psynus V1.1 (April 27, 1988), from `RIP3_Psynus-NWA.d64`. Phaser 3.88.2 presents the
recovered 384 × 247 NTSC display. The browser does not run a C64 emulator. The original
character set, logo, texts, both scroll texts and the music are preserved. The game is
not converted: any key leaves the intro as on the C64, and the reconstruction stops
where the game would start.

Timing uses **NTSC: 1,022,730 Hz, 65 cycles × 263 lines, about 59.826 frames/s**.

## How it works

The disk holds one program. A BASIC line starts a small checksum-and-EOR decoder, which
unpacks the intro and jumps to `$2500`. That sets up the screen, initialises the music
(`$17b3`) and the raster IRQs (`$1800`), and then runs the main loop at `$2530` forever.

- The **main loop** calls the music player (`$1302`), leaves if a key is in the buffer,
  and waits in a delay loop of 6 × 226 `DEX`. It isn't tied to the frame. One round takes
  about 0.9 frames, and the IRQs break into it, and into the music, wherever they fall. So
  the tune's tempo is set by how much time the IRQs leave the main loop.
- **Line 49, `$1833`:** the top scroller (row 0, reversed characters in black, so nine
  raster colours from `$18d7` show through the letters), one pixel a frame. Every fourth
  frame the colours rotate.
- **Line 113, `$1a90`:** 49 lines over the logo (rows 7–14, built from spaces and reversed
  spaces). Each line sets the background from `$1aee` and the X scroll from `$1b20`. The
  scroll table slants and bends the logo, and every third frame it rotates, which sets the
  logo waving. Each line of the loop takes 61–62 cycles, not 65, so the colour changes
  drift across the lines.
- **Line 241, `$1946`:** the bottom scroller (row 24) like the top one, two pixels a frame.
  Every third frame the colours of rows 17–20 rotate through black, greys and white, so
  the greetings fade in and out. Then comes the KERNAL's IRQ handler, which scans the
  keyboard.

`intro-model.js` translates all of this onto a modelled bus. Every instruction is listed
as its read and write cycles. On badlines a read in cycles 12–54 waits until cycle 55. The
IRQ is polled in the second-to-last cycle of an instruction, and in the first cycle of a
taken branch that stays on its page. So the main loop's progress, the IRQs' entry cycles,
the raster colours and the colour stores all fall on the cycles VICE runs them.

`music.js` translates the player instruction by instruction on the same bus. Its SID
writes therefore come at the cycles the main loop reaches them. Three voices share one
table layout, but only two are switched on. After 9,953 frames (about 2¾ minutes) the
order list reaches its end marker and the player stops, leaving voice 1's last noise note
sustaining quietly, as on the C64. The audio worklet runs its own copy of the model
(without the display events) and plays the SID writes at their clocks through the bundled
SID approximation. Sound starts from the beginning of the tune when it is first switched
on.

`exit-model.js` follows the way out: IOINIT (which silences the SID), RESTOR and CINT, then
black, a clear, and the copy of the game to `$0801`. IOINIT enables CIA 1's timer IRQ while
the intro's raster IRQs are still installed. If the timer has run out since the last
keyboard scan, the intro's handlers fire at once, out of place, until the bottom one reads
the CIA. That puts a stray band of raster colours on the screen for a frame. CINT resets
the VIC-II (light blue border, blue screen, the ROM font) and clears the screen from the
bottom up. A raster IRQ that falls between RESTOR and CINT goes to the KERNAL, which never
acknowledges it, so the C64 hangs with the texts frozen. That happens on about one exit
in fifteen.

`display.js` draws each frame from the state at line 28 and the timed writes. A colour
register written in cycle *c* shows from pixel (*c* − 14) × 8 + 9.

## Fidelity

Compared with VICE 3.x (x64sc, NTSC, borders "normal"):

- The model's IRQ timing matches VICE's trace on all 160,030 IRQ entries over 40,007
  frames (11 minutes). All 94,570 SID writes in that time match in cycle and value (VICE's
  monitor reports 160 of them 7 cycles late when an IRQ follows the store, which is a known
  monitor artefact). All 45,491 VIC-II, screen and colour stores in the first 234 frames
  match.
- Rendered frames match VICE screenshots pixel for pixel except for the X-scroll cleanup
  described below. That was checked on 14 intro frames up to frame 12,345, on two exits
  followed frame by frame (one with each kind of stray handler), and on a hung exit.
- The model predicts all 14 traced exits correctly, hanging or reaching the game. The
  stray handlers fire on exactly the traced exits that show them.
