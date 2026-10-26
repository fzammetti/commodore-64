# Newage · Mr. Wino +++ intro

A standalone Phaser reconstruction of Fantasy's Newage crack intro, dated May 17, 1988.
The original character artwork, full scrolling message, color tables, and music are retained.
**Only the intro is converted.** Space ends it at the original game handoff.

## Timing and fidelity

NTSC throughout: **1,022,730 CPU clocks/sec, 65 clocks/line, 263 lines/frame,
59.826265 frames/sec**. This is a native JavaScript translation of the intro's
visual routines, presented as a pixel texture by the supplied `vendor/phaser.js`.
It does not run a C64 emulator or the PRG in the browser.

The graphics and text come from the original character/screen data. SID playback
uses 37,627 original register writes with measured NTSC bus timestamps and a
verified musical loop, rendered with the sibling conversions' SID synthesizer.
The analog SID sound is an approximation. Raster writes retain a captured
194-frame NTSC interrupt-timing cadence and the VIC's nine-pixel display delay,
reproducing the bands and logo shading with their original timing variations.

**192 synchronized VICE captures match pixel-for-pixel: 18,210,816 pixels, zero differences.**
These cover a full logo color/fine-scroll cycle and both divider bars. Original
6502 instruction execution independently verifies the native effect state at
39 checkpoints through 16,000 frames, including the scroller wrapping.
