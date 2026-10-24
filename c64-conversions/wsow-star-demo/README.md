# Star Demo — WSOW

Phaser reconstruction of WSOW's (We Share Our Warez) Commodore 64 Star Demo.
A Koala picture of the Enterprise is drawn one pixel row at a time. Then eight multicolor
sprites scroll the message through the opened lower border to music from The Last Ninja.
The browser runs a native JavaScript model of the recovered routines, without a C64 emulator.

SPACE (or clicking the display) skips the reveal, R restarts a part, M toggles sound, P pauses,
and F enters fullscreen. The original takes no input. Sound starts after interaction.

Timing uses **NTSC: 1,022,730 Hz, 65 cycles × 263 lines, about 59.826 frames/s**. The music
follows the CIA timer. The program sets its high byte to `$4b` over the NTSC KERNAL's `$95`,
so the player runs 52.85 times per second.

## How the original works

- `$0810` depacks to `$0800–$8fff`, then `SYS 7403` (`$1ceb`) moves the player to `$a000`.
  Next it moves the reveal code to `$5e0c` and calls the music init at `$b7f5`.
- `$5e0c` clears the bitmap at `$2000` and copies the screen and color RAM from the Koala
  image at `$6000`. Background `$8710` is white.
- `$5f40` calls `$5ebc` 200 times with a busy-wait between calls. Each call copies one pixel row of
  all 40 cells. The pass takes about 281 frames.
- `$106b` places the sprites at Y=`$fd` and installs raster IRQs on lines 0 and `$f8`. They set
  `$d011` to `$3b` and `$13`. The 24-row switch at line 248 keeps both vertical borders open.
- `$10f9` runs in both IRQs and moves each sprite left 1 px, or 2 px per frame. At X=0 a sprite
  wraps to 350 and takes the next character from `$120e` as pointer `char+$20`, or `$ff` for a space.
- The CIA IRQ path at `$1cdd` plays the music at `$b844`. The `↑`/F1 handler at `$1169`
  never runs, because `$1cbb` turns `$1072` into an `RTS`.

Real-hardware details kept in the model:

- The line-0 IRQ moves the sprites after their upper rows are drawn, so each letter's lower half sits 1 px left.
- The mid-line switch to text mode on line 248 garbles the picture's last three lines.
- The digits in "1001 CREW" point into the message bytes and appear as garbage sprites.
