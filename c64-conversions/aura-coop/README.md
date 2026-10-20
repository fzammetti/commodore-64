# Aura — Phaser reconstruction

A native JavaScript reconstruction of Coop's 1990 Commodore 64 demo. Phaser 3.88.2
presents the recovered 384 × 247 NTSC display. The browser does not run a C64 emulator.
Original character sets, screen data, sprites, bitmap, scroll messages, and animation
routines are preserved across the welcome screen and four main sections.

## Run

https://zammetti.com/c64-conversions/aura-coop

Use Space or click the picture to advance. The section buttons and keys 0–2 jump directly
to a section. R replays the current section, M toggles sound, P pauses, and F toggles
fullscreen. Escape also leaves fullscreen. Browser audio starts after an interaction.

## Fidelity limits

Raster effects are reconstructed at scanline resolution; this is not a cycle-exact VIC-II
implementation. SID register ordering is retained within each NTSC frame, while write times
are quantized to frame boundaries and analog SID sound is approximated. Each section has
about three minutes of captured music, then restarts; seamless song loops are unverified.
Packing delays and loader flashes are skipped when switching sections.
