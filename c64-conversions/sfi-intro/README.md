# SFI Intro — Phaser reconstruction

A native JavaScript reconstruction of the 1989 Commodore 64 intro that Excelsior wrote for
ShadowForce International (SFI). Phaser 3.88.2 presents the recovered 384 × 247 NTSC display.
The browser does not run a C64 emulator. The original logo, character sets, sprite animations,
both scroll texts, the five fading messages and the music are preserved.

Timing uses **NTSC: 1,022,730 Hz, 65 cycles × 263 lines, about 59.826 frames/s**.

## Fidelity

The six raster interrupts are replayed at the line and cycle where VICE (x64sc, NTSC) traced
each VIC-II write. Rendered frames match VICE screenshots pixel for pixel, apart from one
"grey dot" pixel that VICE emulates for newer VIC-II chips. Message fades follow the busy-wait
loops, with each frame's measured IRQ load. 119 of 121 traced fades land on the same frame,
and the rest are one frame apart. The music is a 2.5-minute SID register capture with a
verified loop. Analog SID sound is approximated, and IRQ jitter of one or two cycles is not
reproduced. See [analysis/ANALYSIS.md](analysis/ANALYSIS.md).
