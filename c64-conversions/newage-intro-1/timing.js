export const VIDEO_STANDARD = 'NTSC';
export const CPU_CLOCK = 1022730;
export const CYCLES_PER_LINE = 65;
export const RASTER_LINES = 263;
export const CYCLES_PER_FRAME = CYCLES_PER_LINE * RASTER_LINES;
export const FRAME_RATE = CPU_CLOCK / CYCLES_PER_FRAME;
export const FIRST_VISIBLE_LINE = 28;
export const VISIBLE_HEIGHT = 247;
