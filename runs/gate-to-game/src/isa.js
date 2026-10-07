// isa.js: the G16 instruction set, written as plain arithmetic.
//
// This is the reference the gate-level CPU is tested against, and the
// behaviour the assembler and compiler target.
//
//   0vvv vvvv vvvv vvvv   load:    A = v (0 to 32767)
//   1mzn zncf fsAD Mleg   compute: r = ALU(D, m ? M : A); write r to the
//                                  chosen A/D/M; jump to A if r < 0 (l),
//                                  r = 0 (e) or r > 0 (g)
//
// The ALU conditions both operands (zero it, then invert it), computes
// x+y+ci, x&y, x|y or x^y (f), then optionally shifts right by one (s).
// M is the RAM word at address A. One instruction per clock cycle.
'use strict';
(function (G) {
  const M16 = 0xFFFF;
  const CTL_BITS = ['zx', 'nx', 'zy', 'ny', 'ci', 'f1', 'f0', 'sh'];   // instruction bits 13..6

  function ctlFields(ctl) {
    return {
      zx: ctl >> 7 & 1, nx: ctl >> 6 & 1, zy: ctl >> 5 & 1, ny: ctl >> 4 & 1, ci: ctl >> 3 & 1,
      f: ctl >> 1 & 3, sh: ctl & 1,
    };
  }

  function alu(x, y, ctl) {
    const c = typeof ctl === 'number' ? ctlFields(ctl) : ctl;
    let a = c.zx ? 0 : x; if (c.nx) a = ~a & M16;
    let b = c.zy ? 0 : y; if (c.ny) b = ~b & M16;
    let r = c.f === 0 ? (a + b + c.ci) & M16 : c.f === 1 ? a & b : c.f === 2 ? a | b : a ^ b;
    if (c.sh) r >>>= 1;
    return r;
  }

  function decode(w) {
    if (!(w & 0x8000)) return { isC: 0, value: w };
    return {
      isC: 1, m: w >> 14 & 1, ctl: w >> 6 & 0xFF,
      dA: w >> 5 & 1, dD: w >> 4 & 1, dM: w >> 3 & 1,
      jl: w >> 2 & 1, je: w >> 1 & 1, jg: w & 1,
    };
  }

  function encodeC({ m = 0, ctl, dA = 0, dD = 0, dM = 0, jl = 0, je = 0, jg = 0 }) {
    return 0x8000 | m << 14 | ctl << 6 | dA << 5 | dD << 4 | dM << 3 | jl << 2 | je << 1 | jg;
  }

  // One cycle of the CPU, as a pure function. `s` is {A, D, PC}. Outputs are
  // what the CPU drives during the cycle; next is the state after the edge.
  // Like the hardware, the ALU runs on every cycle, even for loads, so outM
  // is defined (if meaningless) when writeM is 0.
  function step(s, inst, inM, reset = 0) {
    const isC = inst >> 15 & 1;
    const r = alu(s.D, inst >> 14 & 1 ? inM : s.A, inst >> 6 & 0xFF);
    const writeM = isC & (inst >> 3);
    const neg = r >> 15 & 1, zero = r === 0 ? 1 : 0, pos = neg | zero ? 0 : 1;
    const jump = isC & ((inst >> 2 & neg) | (inst >> 1 & zero) | (inst & pos)) & 1;
    const out = { outM: r, writeM: writeM & 1, addressM: s.A, pc: s.PC };
    let next;
    if (reset) next = { A: 0, D: 0, PC: 0 };
    else next = {
      A: !isC ? inst : inst >> 5 & 1 ? r : s.A,
      D: isC && inst >> 4 & 1 ? r : s.D,
      PC: jump ? s.A : (s.PC + 1) & M16,
    };
    return { out, next, jump };
  }

  // Memory map of the board.
  const MAP = {
    RAM: 0x0000, RAM_WORDS: 4096,
    SCREEN: 0x4000, WIDTH: 64, HEIGHT: 48,
    KEYS: 0x6000, TICK: 0x6001,
  };

  const JUMPS = { '': 0, jgt: 1, jeq: 2, jge: 3, jlt: 4, jne: 5, jle: 6, jmp: 7 };
  const JUMP_NAMES = Object.fromEntries(Object.entries(JUMPS).map(([k, v]) => [v, k]));

  G.isa = { alu, ctlFields, decode, encodeC, step, MAP, JUMPS, JUMP_NAMES, CTL_BITS, M16 };
})(globalThis.G2G || (globalThis.G2G = {}));
