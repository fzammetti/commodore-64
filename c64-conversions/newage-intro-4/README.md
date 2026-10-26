# NewAge Sorcerer Lord Intro — Phaser reconstruction

A native JavaScript reconstruction of the intro Fantasy wrote for the NewAge Importing
Crew's release of Sorcerer Lord (April 15, 1988), from `RIP4_Sorcerer_Lord-NWA.d64`.
Phaser 3.88.2 presents the recovered 384 × 247 NTSC display. The browser does not run a
C64 emulator. The original character set, the multicolour NWA logo, the texts, both scroll
texts and the SID drone are preserved. The game is not converted: any key leaves the intro
as on the C64, and the reconstruction stops where the game would start.

Timing uses **NTSC: 1,022,730 Hz, 65 cycles × 263 lines, about 59.826 frames/s**.

## How it works

The disk holds one program. A BASIC line starts a decruncher, which unpacks the intro and
calls `$1800`. That clears the screen to black, switches to the character set at `$0800`,
starts the SID ($1e00) and the raster IRQs ($1900), and then waits at `$182a` for a key in
the KERNAL's keyboard buffer. The wait is an 8-cycle loop, and the IRQs break into it.

- **Line 50, `$1925`:** the top scroller (row 0, 38 columns), two pixels a frame. Every
  fourth frame it moves a character.
- **Line 58, `$1957`:** 40 columns again. The text pointer at `$b0`, which both scrollers
  share, swaps to the middle scroller's.
- **Line 82, `$19d5`:** the middle scroller (row 4), one pixel a frame.
- **Line 90, `$1a04`:** X scroll 0 and 38 columns for the rest of the screen.
- **Line 122, `$1b33`:** 55 rounds over the logo, each setting `$d023` and `$d022` from
  two colour tables and switching on multicolour mode. A round takes 83 cycles, not 65,
  so the colours change partway along each line and slant across the logo. Every third
  frame the tables rotate, one left and one right. Then it sets the scrollers' colour RAM
  from two 40-colour tables, which rotate every frame. Every third frame rows 5–8 and
  18–22 all take the next colour of a fade from black through the greys to white and
  back. Last comes the KERNAL's IRQ handler, which scans the keyboard.

The top handler's coarse step takes long enough that the IRQ for line 58 is already
waiting when it returns. RTI polls the IRQ line, so that IRQ follows at once.

`intro-model.js` translates all of this onto a modelled bus. Every instruction is listed
as its read and write cycles. On badlines a read in cycles 12–54 waits until cycle 55. The
IRQ is polled in the second-to-last cycle of an instruction, and in the first cycle of a
taken branch that stays on its page. So the main loop, the IRQs' entry cycles, the logo's
colours and all the colour and screen stores land on the cycles VICE runs them.

The "music" is what `$1e00` sets up once: three sawtooth voices with their gates on, at
nearly the same pitch (about 95 Hz), so they beat against each other. Nothing writes the
SID again until the exit turns the volume down. The audio worklet plays that drone through
the bundled SID approximation. It runs its own copy of the model to find the moment
IOINIT silences it.

`exit-model.js` follows the way out at `$1f00`, also instruction by instruction:

- PRINT CHR$(147). The KERNAL clears the screen from the bottom up in black while the IRQs
  keep running, so the scrollers' new characters and the colour rows come back over the
  cleared screen.
- Border and screen black, then IOINIT, RESTOR and CINT. IOINIT enables CIA 1's timer IRQ
  while the intro's handlers are still installed. If the timer has run out since the last
  keyboard scan, the handlers fire at once, out of place, until the logo handler reads the
  CIA. That gives a stray band of logo colours for a frame.
- A raster IRQ that falls between RESTOR and CINT goes to the KERNAL, which never
  acknowledges it, so the C64 hangs with the screen frozen. That happens on about one exit
  in five.
- Otherwise CINT resets the VIC-II (light blue border, blue screen, the ROM font) and
  clears the screen again. The routine copied to `$033c` clears it once more, copies the
  game to `$0801` and RUNs it about a second later. The reconstruction stops there.

`display.js` draws each frame from the state at line 28 and the timed writes. A colour
register written in cycle *c* shows from pixel (*c* − 14) × 8 + 9.

## Fidelity

Compared with VICE 3.x (x64sc, NTSC, borders "normal"):

- The model's IRQ timing matches VICE's trace on all 119,947 IRQ entries over 40,000
  frames (11 minutes). All 169,511 VIC-II, screen and colour stores in the first 440
  frames match in cycle and value.
- 17 exits were forced in VICE at different points, by patching the intro's own BEQ at
  `$182e`. The model gets every one right: the 4 that hang and the 13 that reach the game
  (each reaching `$FF63` on the same cycle), with every stray handler. Every store matches
  in cycle and value. The only exceptions are stores that VICE's monitor reports 7 cycles
  late when an IRQ follows the instruction, a known artefact of the monitor.
- Rendered frames match VICE screenshots pixel for pixel, apart from the cleanup below.
  That was checked on 9 intro frames up to frame 1,000, and frame by frame through three
  exits: a plain one, one with stray handlers and a hung one. The first frame is the
  exception, because its top half still shows the loader on the C64.

## Cleanup

The IRQs write `$d016` partway along a line. The logo IRQ switches on multicolour mode a
line and a half into the logo, which on the C64 leaves a step between hires and multicolour
on its top edge. CINT changes the border colour and the column width mid-line on the way
out. Here `$d016` and the border colour keep their value from the line's left edge for the
whole line, and a mid-line write shows from the next line. The logo's colour changes still
land mid-line where the original makes them, since those give the stripes their slant.
