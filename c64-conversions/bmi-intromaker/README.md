# BMI Intromaker 1 — Phaser reconstruction

A native JavaScript reconstruction of *BMI Intromaker 1*, released in 1988 by Black Magic
Incorporated and written by Fantasy of NPN. Phaser 3.88.2 presents the recovered
384 × 247 NTSC display. The browser does not run a C64 emulator.

One 75-block PRG holds three programs:

1. **The intro.** It has a colour-cycling BMI logo, raster-bar title lines, a character
   scroller and a bouncing sprite scroller, with music by JT.
2. **The BMI Intro Editor V1.0.** SPACE in the intro starts it. It edits both scroll texts and
   the three title lines, saves the intro and shows two pages of instructions.
3. **Compactor V4/S** by E.C.A Productions. The editor starts it as its linker. It joins the
   intro to another program, packs both and saves a runnable file.

All three run here. The **Disk · device 8** panel is a virtual 1541 seeded from the original
D64 image. Files saved by the editor or the compactor appear there and can be downloaded.
They run on a real C64 or in VICE. *Add PRG…* places your own program on the disk to link.
