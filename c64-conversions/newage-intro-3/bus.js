// Bus patterns of 6502 instructions, one letter per cycle: 'r' a read, which a badline
// can stall, 'w' a write.
export const IMPLIED = 'rr', IMMEDIATE = 'rr', ZP_READ = 'rrr', ZP_WRITE = 'rrw', ZP_RMW = 'rrrww';
export const ZP_INDEXED_READ = 'rrrr';
export const ABS_READ = 'rrrr', ABS_READ_CROSS = 'rrrrr', ABS_WRITE = 'rrrw';
export const ABS_INDEXED_WRITE = 'rrrrw', ABS_RMW = 'rrrrww', ABS_INDEXED_RMW = 'rrrrrww';
export const INDIRECT_Y = 'rrrrr', INDIRECT_Y_CROSS = 'rrrrrr', INDIRECT_Y_WRITE = 'rrrrrw';
export const JSR = 'rrrwwr', RTS = 'rrrrrr', JMP = 'rrr', JMP_INDIRECT = 'rrrrr';
export const BRANCH = 'rr', BRANCH_TAKEN = 'rrr', BRANCH_CROSS = 'rrrr';
export const PUSH = 'rrw', PULL = 'rrrr', RTI = 'rrrrrr', INTERRUPT = 'rrwwwrr';
// The CPU polls the IRQ line in an instruction's second-to-last cycle; a taken branch
// that stays on its page polls as if it were not taken, in its first.
export const POLL_EARLY = 0;
