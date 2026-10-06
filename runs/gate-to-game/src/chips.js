// chips.js: the chip library, from NOT up to the G16 CPU and its RAM.
//
// Every chip is built only from chips defined above it, and in the end only
// from Nand. Every chip also carries a behavioural spec (`test`), which the
// gate test suite checks the flattened NAND netlist against: exhaustively when
// the inputs are narrow enough, otherwise on random vectors and sequences.
'use strict';
(function (G) {
  const { defChip } = G.hdl;
  const M16 = 0xFFFF;
  const bit = (v, i) => (v >>> i) & 1;

  // Shorthands used inside chip bodies.
  const nand = (c, a, b, l) => c.nand(a, b, l);
  const not = (c, a, l) => c.use('Not', { a }, l).out;
  const and = (c, a, b, l) => c.use('And', { a, b }, l).out;
  const or = (c, a, b, l) => c.use('Or', { a, b }, l).out;
  const xor = (c, a, b, l) => c.use('Xor', { a, b }, l).out;
  const mux = (c, a, b, sel, l) => c.use('Mux', { a, b, sel }, l).out;
  const range = n => Array.from({ length: n }, (_, i) => i);

  // ---- Gates -------------------------------------------------------------

  defChip('Not', {
    about: 'A NAND with both inputs tied together.',
    ins: { a: 1 }, outs: { out: 1 },
    build: (c, { a }) => ({ out: nand(c, a, a) }),
    test: { comb: ({ a }) => ({ out: a ^ 1 }) },
  });

  defChip('And', {
    about: 'NAND, then NOT.',
    ins: { a: 1, b: 1 }, outs: { out: 1 },
    build: (c, { a, b }) => ({ out: not(c, nand(c, a, b)) }),
    test: { comb: ({ a, b }) => ({ out: a & b }) },
  });

  defChip('Or', {
    about: 'De Morgan: a OR b = NAND(NOT a, NOT b).',
    ins: { a: 1, b: 1 }, outs: { out: 1 },
    build: (c, { a, b }) => ({ out: nand(c, not(c, a), not(c, b)) }),
    test: { comb: ({ a, b }) => ({ out: a | b }) },
  });

  defChip('Xor', {
    about: 'The classic four-NAND exclusive or.',
    ins: { a: 1, b: 1 }, outs: { out: 1 },
    build: (c, { a, b }) => {
      const n = nand(c, a, b);
      return { out: nand(c, nand(c, a, n), nand(c, b, n)) };
    },
    test: { comb: ({ a, b }) => ({ out: a ^ b }) },
  });

  defChip('Mux', {
    about: 'out = sel ? b : a.',
    ins: { a: 1, b: 1, sel: 1 }, outs: { out: 1 },
    build: (c, { a, b, sel }) => ({ out: nand(c, nand(c, a, not(c, sel)), nand(c, b, sel)) }),
    test: { comb: ({ a, b, sel }) => ({ out: sel ? b : a }) },
  });

  defChip('DMux', {
    about: 'Routes in to a (sel = 0) or b (sel = 1).',
    ins: { in: 1, sel: 1 }, outs: { a: 1, b: 1 },
    build: (c, p) => ({ a: and(c, p.in, not(c, p.sel)), b: and(c, p.in, p.sel) }),
    test: { comb: p => ({ a: p.sel ? 0 : p.in, b: p.sel ? p.in : 0 }) },
  });

  // ---- 16-bit buses ------------------------------------------------------

  const wide = (name, gate, f) => defChip(name, {
    about: `Sixteen ${gate} gates side by side.`,
    ins: { a: 16, b: 16 }, outs: { out: 16 }, layout: { grid: 4 },
    build: (c, { a, b }) => ({ out: range(16).map(i => c.use(gate, { a: a[i], b: b[i] }, `${gate.toLowerCase()}${i}`).out) }),
    test: { comb: ({ a, b }) => ({ out: f(a, b) & M16 }) },
  });
  wide('And16', 'And', (a, b) => a & b);
  wide('Or16', 'Or', (a, b) => a | b);
  wide('Xor16', 'Xor', (a, b) => a ^ b);

  defChip('Mux16', {
    about: 'Sixteen multiplexers sharing one select line.',
    ins: { a: 16, b: 16, sel: 1 }, outs: { out: 16 }, layout: { grid: 4 },
    build: (c, { a, b, sel }) => ({ out: range(16).map(i => mux(c, a[i], b[i], sel, `mux${i}`)) }),
    test: { comb: ({ a, b, sel }) => ({ out: sel ? b : a }) },
  });

  defChip('Mux4Way16', {
    about: 'Picks one of four buses: two levels of Mux16.',
    ins: { a: 16, b: 16, c: 16, d: 16, sel: 2 }, outs: { out: 16 },
    build: (c, p) => {
      const ab = c.use('Mux16', { a: p.a, b: p.b, sel: p.sel[0] }, 'ab').out;
      const cd = c.use('Mux16', { a: p.c, b: p.d, sel: p.sel[0] }, 'cd').out;
      return { out: c.use('Mux16', { a: ab, b: cd, sel: p.sel[1] }, 'pick').out };
    },
    test: { comb: p => ({ out: [p.a, p.b, p.c, p.d][p.sel] }) },
  });

  defChip('Mux8Way16', {
    about: 'Picks one of eight buses.',
    ins: { a: 16, b: 16, c: 16, d: 16, e: 16, f: 16, g: 16, h: 16, sel: 3 }, outs: { out: 16 },
    build: (c, p) => {
      const lo = c.use('Mux4Way16', { a: p.a, b: p.b, c: p.c, d: p.d, sel: p.sel.slice(0, 2) }, 'lo').out;
      const hi = c.use('Mux4Way16', { a: p.e, b: p.f, c: p.g, d: p.h, sel: p.sel.slice(0, 2) }, 'hi').out;
      return { out: c.use('Mux16', { a: lo, b: hi, sel: p.sel[2] }, 'pick').out };
    },
    test: { comb: p => ({ out: [p.a, p.b, p.c, p.d, p.e, p.f, p.g, p.h][p.sel] }) },
  });

  defChip('DMux8Way', {
    about: 'Routes one line to one of eight outputs.',
    ins: { in: 1, sel: 3 }, outs: { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1, h: 1 },
    build: (c, p) => {
      const top = c.use('DMux', { in: p.in, sel: p.sel[2] }, 'hi');
      const l = c.use('DMux', { in: top.a, sel: p.sel[1] }, 'mid0');
      const h = c.use('DMux', { in: top.b, sel: p.sel[1] }, 'mid1');
      const q = [l.a, l.b, h.a, h.b].map((x, i) => c.use('DMux', { in: x, sel: p.sel[0] }, `lo${i}`));
      return { a: q[0].a, b: q[0].b, c: q[1].a, d: q[1].b, e: q[2].a, f: q[2].b, g: q[3].a, h: q[3].b };
    },
    test: { comb: p => Object.fromEntries('abcdefgh'.split('').map((k, i) => [k, p.sel === i ? p.in : 0])) },
  });

  defChip('Or16Way', {
    about: 'Is any of the sixteen bits set? A tree of fifteen ORs.',
    ins: { in: 16 }, outs: { out: 1 },
    build: (c, p) => {
      let level = p.in, n = 0;
      while (level.length > 1) {
        const next = [];
        for (let i = 0; i < level.length; i += 2) next.push(or(c, level[i], level[i + 1], `or${n++}`));
        level = next;
      }
      return { out: level[0] };
    },
    test: { comb: p => ({ out: p.in ? 1 : 0 }) },
  });

  // ---- Arithmetic --------------------------------------------------------

  defChip('HalfAdder', {
    about: 'sum = a XOR b, carry = a AND b, sharing the first NAND.',
    ins: { a: 1, b: 1 }, outs: { sum: 1, carry: 1 },
    build: (c, { a, b }) => {
      const n = nand(c, a, b);
      return { sum: nand(c, nand(c, a, n), nand(c, b, n)), carry: not(c, n) };
    },
    test: { comb: ({ a, b }) => ({ sum: a ^ b, carry: a & b }) },
  });

  defChip('FullAdder', {
    about: 'Nine NANDs: a + b + carry-in.',
    ins: { a: 1, b: 1, cin: 1 }, outs: { sum: 1, carry: 1 },
    build: (c, { a, b, cin }) => {
      const n1 = nand(c, a, b);
      const x = nand(c, nand(c, a, n1), nand(c, b, n1));       // a XOR b
      const n5 = nand(c, x, cin);
      const sum = nand(c, nand(c, x, n5), nand(c, cin, n5));   // x XOR cin
      return { sum, carry: nand(c, n5, n1) };                  // ab + cin(a XOR b)
    },
    test: { comb: ({ a, b, cin }) => ({ sum: (a + b + cin) & 1, carry: (a + b + cin) >> 1 }) },
  });

  defChip('Add16', {
    about: 'Sixteen full adders in a ripple-carry chain.',
    ins: { a: 16, b: 16, cin: 1 }, outs: { out: 16 }, layout: { grid: 4, snake: true },
    build: (c, { a, b, cin }) => {
      let carry = cin;
      const out = range(16).map(i => {
        const fa = c.use('FullAdder', { a: a[i], b: b[i], cin: carry }, `fa${i}`);
        carry = fa.carry;
        return fa.sum;
      });
      return { out };
    },
    test: { comb: ({ a, b, cin }) => ({ out: (a + b + cin) & M16 }) },
  });

  defChip('Inc16', {
    about: 'Adds one: a chain of half adders with the first carry tied to VDD.',
    ins: { in: 16 }, outs: { out: 16 }, layout: { grid: 4, snake: true },
    build: (c, p) => {
      let carry = c.one;
      const out = range(16).map(i => {
        const ha = c.use('HalfAdder', { a: p.in[i], b: carry }, `ha${i}`);
        carry = ha.carry;
        return ha.sum;
      });
      return { out };
    },
    test: { comb: p => ({ out: (p.in + 1) & M16 }) },
  });

  defChip('PreBit', {
    about: 'One bit of operand conditioning: (v AND NOT z) XOR n.',
    ins: { v: 1, nz: 1, n: 1 }, outs: { out: 1 },
    build: (c, p) => ({ out: xor(c, and(c, p.v, p.nz), p.n) }),
    test: { comb: p => ({ out: (p.v & p.nz) ^ p.n }) },
  });

  defChip('Pre16', {
    about: 'Zero the operand (z), then invert it (n).',
    ins: { v: 16, z: 1, n: 1 }, outs: { out: 16 }, layout: { grid: 4, lead: 1 },
    build: (c, p) => {
      const nz = not(c, p.z, 'notz');
      return { out: range(16).map(i => c.use('PreBit', { v: p.v[i], nz, n: p.n }, `bit${i}`).out) };
    },
    test: { comb: p => ({ out: ((p.z ? 0 : p.v) ^ (p.n ? M16 : 0)) & M16 }) },
  });

  defChip('Shift16', {
    about: 'sh = 1 shifts the result right one place (a 0 enters at the top).',
    ins: { in: 16, sh: 1 }, outs: { out: 16 },
    build: (c, p) => ({ out: c.use('Mux16', { a: p.in, b: [...p.in.slice(1), c.zero], sel: p.sh }, 'shift').out }),
    test: { comb: p => ({ out: p.sh ? p.in >>> 1 : p.in }) },
  });

  // The ALU's control bits come straight from the instruction:
  // zx nx zy ny ci f1 f0 sh. f selects x'+y'+ci, x'&y', x'|y' or x'^y'.
  function aluSpec(x, y, ctl) {
    let a = ctl.zx ? 0 : x; if (ctl.nx) a = ~a & M16;
    let b = ctl.zy ? 0 : y; if (ctl.ny) b = ~b & M16;
    const f = ctl.f;
    let r = f === 0 ? (a + b + ctl.ci) & M16 : f === 1 ? a & b : f === 2 ? a | b : a ^ b;
    if (ctl.sh) r >>>= 1;
    return { out: r, zr: r === 0 ? 1 : 0, ng: r >>> 15 };
  }

  defChip('ALU', {
    about: 'Condition both operands, compute all four functions, pick one, optionally shift.',
    ins: { x: 16, y: 16, zx: 1, nx: 1, zy: 1, ny: 1, ci: 1, f: 2, sh: 1 },
    outs: { out: 16, zr: 1, ng: 1 },
    build: (c, p) => {
      const xa = c.use('Pre16', { v: p.x, z: p.zx, n: p.nx }, 'xpre').out;
      const ya = c.use('Pre16', { v: p.y, z: p.zy, n: p.ny }, 'ypre').out;
      const sum = c.use('Add16', { a: xa, b: ya, cin: p.ci }, 'adder').out;
      const an = c.use('And16', { a: xa, b: ya }, 'and').out;
      const o = c.use('Or16', { a: xa, b: ya }, 'or').out;
      const x = c.use('Xor16', { a: xa, b: ya }, 'xor').out;
      const pick = c.use('Mux4Way16', { a: sum, b: an, c: o, d: x, sel: p.f }, 'select').out;
      const out = c.use('Shift16', { in: pick, sh: p.sh }, 'shift').out;
      const any = c.use('Or16Way', { in: out }, 'nonzero').out;
      return { out, zr: not(c, any, 'zero'), ng: out[15] };
    },
    test: { comb: p => aluSpec(p.x, p.y, p) },
  });

  // ---- Memory ------------------------------------------------------------

  defChip('DLatch', {
    about: 'A gated D latch: four NANDs. While e = 1, q follows d; while e = 0, q holds.',
    ins: { d: 1, e: 1 }, outs: { q: 1, qb: 1 },
    build: (c, { d, e }) => {
      const s = nand(c, d, e, 's');
      const r = nand(c, s, e, 'r');
      return c.latch(s, r);
    },
    // Sequential, but without the clock: e is an ordinary input.
    test: { seq: { clocked: false, init: () => ({ q: 0 }), step: (st, p) => { const q = p.e ? p.d : st.q; return { state: { q }, outs: { q, qb: q ^ 1 } }; } } },
  });

  defChip('DFF', {
    about: 'Master-slave flip-flop: two latches on opposite clock phases, nine NANDs.',
    flipflop: true,
    ins: { d: 1 }, outs: { q: 1 },
    build: (c, { d }) => {
      const nclk = not(c, c.clk, 'nclk');
      const m = c.use('DLatch', { d, e: nclk }, 'master');
      c.cut(m.q);
      const s = c.use('DLatch', { d: m.q, e: c.clk }, 'slave');
      c.dffs.push({ inst: c.cur, mq: m.q, mqb: m.qb, sq: s.q, sqb: s.qb });
      return { q: s.q };
    },
    test: { seq: { init: () => ({ q: 0 }), step: (st, p) => ({ state: { q: p.d }, outs: { q: st.q } }) } },
  });

  defChip('Bit', {
    about: 'One bit of storage: a flip-flop that reloads itself unless load = 1.',
    ins: { in: 1, load: 1 }, outs: { out: 1 },
    build: (c, p) => {
      const q = c.wire();
      const d = mux(c, q, p.in, p.load, 'keep');
      c.bind(q, c.use('DFF', { d }, 'dff').q);
      return { out: q };
    },
    test: { seq: { init: () => ({ v: 0 }), step: (st, p) => ({ state: { v: p.load ? p.in : st.v }, outs: { out: st.v } }) } },
  });

  const regSeq = { init: () => ({ v: 0 }), step: (st, p) => ({ state: { v: p.load ? p.in : st.v }, outs: { out: st.v } }) };

  defChip('Register16', {
    about: 'Sixteen bits that load together.',
    ins: { in: 16, load: 1 }, outs: { out: 16 }, layout: { grid: 4 },
    build: (c, p) => ({ out: range(16).map(i => c.use('Bit', { in: p.in[i], load: p.load }, `bit${i}`).out) }),
    test: { seq: regSeq },
  });

  defChip('ResetRegister16', {
    about: 'A Register16 that clears when reset = 1.',
    ins: { in: 16, load: 1, reset: 1 }, outs: { out: 16 },
    build: (c, p) => {
      const keep = not(c, p.reset, 'notreset');
      const data = c.use('And16', { a: p.in, b: Array(16).fill(keep) }, 'clear').out;
      const load = or(c, p.load, p.reset, 'loadorreset');
      return { out: c.use('Register16', { in: data, load }, 'reg').out };
    },
    test: { seq: { init: () => ({ v: 0 }), step: (st, p) => ({ state: { v: p.reset ? 0 : p.load ? p.in : st.v }, outs: { out: st.v } }) } },
  });

  defChip('DFF16', {
    about: 'Sixteen flip-flops that load every cycle.',
    ins: { in: 16 }, outs: { out: 16 }, layout: { grid: 4 },
    build: (c, p) => ({ out: range(16).map(i => c.use('DFF', { d: p.in[i] }, `dff${i}`).q) }),
    test: { seq: { init: () => ({ v: 0 }), step: (st, p) => ({ state: { v: p.in }, outs: { out: st.v } }) } },
  });

  defChip('PC', {
    about: 'The program counter: next = reset ? 0 : jump ? a : pc + 1.',
    ins: { a: 16, jump: 1, reset: 1 }, outs: { out: 16 },
    build: (c, p) => {
      const pc = c.wires(16);
      const inc = c.use('Inc16', { in: pc }, 'inc').out;
      const next = c.use('Mux16', { a: inc, b: p.a, sel: p.jump }, 'jumpmux').out;
      const keep = not(c, p.reset, 'notreset');
      const data = c.use('And16', { a: next, b: Array(16).fill(keep) }, 'clear').out;
      c.bind(pc, c.use('DFF16', { in: data }, 'reg').out);
      return { out: pc };
    },
    test: { seq: { init: () => ({ v: 0 }), step: (st, p) => ({ state: { v: p.reset ? 0 : p.jump ? p.a : (st.v + 1) & M16 }, outs: { out: st.v } }) } },
  });

  const ramChip = (name, words, sub, subWords) => {
    const k = Math.log2(words), sk = Math.log2(subWords);
    defChip(name, {
      about: `${words} words: eight ${sub}s, a DMux8Way for load and a Mux8Way16 for reading.`,
      ins: { in: 16, load: 1, address: k }, outs: { out: 16 },
      build: (c, p) => {
        const lo = p.address.slice(0, sk), hi = p.address.slice(sk);
        const sel = c.use('DMux8Way', { in: p.load, sel: hi }, 'decode');
        const banks = 'abcdefgh'.split('').map((key, i) => {
          const ins = sub === 'Register16' ? { in: p.in, load: sel[key] } : { in: p.in, load: sel[key], address: lo };
          return c.use(sub, ins, `${sub === 'Register16' ? 'reg' : 'bank'}${i}`).out;
        });
        const m = Object.fromEntries('abcdefgh'.split('').map((key, i) => [key, banks[i]]));
        return { out: c.use('Mux8Way16', { ...m, sel: hi }, 'read').out };
      },
      test: {
        seq: {
          init: () => ({ mem: new Uint16Array(words) }),
          step: (st, p) => { const out = st.mem[p.address]; if (p.load) st.mem[p.address] = p.in; return { state: st, outs: { out } }; },
          // RAM reads are combinational: out shows the word at the current address.
          readThrough: true,
        },
      },
    });
  };
  ramChip('RAM8', 8, 'Register16', 1);
  ramChip('RAM64', 64, 'RAM8', 8);
  ramChip('RAM512', 512, 'RAM64', 64);
  ramChip('RAM4K', 4096, 'RAM512', 512);

  // ---- The CPU -----------------------------------------------------------

  defChip('Decode', {
    about: 'Splits the instruction into control lines and gates the writes.',
    ins: { inst: 16 },
    outs: { isA: 1, loadA: 1, loadD: 1, writeM: 1, m: 1, zx: 1, nx: 1, zy: 1, ny: 1, ci: 1, f: 2, sh: 1, jl: 1, je: 1, jg: 1 },
    build: (c, { inst: i }) => {
      const isC = i[15];
      const isA = not(c, isC, 'isA');
      return {
        isA,
        loadA: or(c, isA, and(c, isC, i[5], 'destA'), 'loadA'),
        loadD: and(c, isC, i[4], 'loadD'),
        writeM: and(c, isC, i[3], 'writeM'),
        m: i[14], zx: i[13], nx: i[12], zy: i[11], ny: i[10], ci: i[9], f: [i[7], i[8]], sh: i[6],
        jl: and(c, isC, i[2], 'jlt'), je: and(c, isC, i[1], 'jeq'), jg: and(c, isC, i[0], 'jgt'),
      };
    },
    test: {
      comb: ({ inst }) => {
        const C = bit(inst, 15);
        return {
          isA: C ^ 1, loadA: (C ^ 1) | (C & bit(inst, 5)), loadD: C & bit(inst, 4), writeM: C & bit(inst, 3),
          m: bit(inst, 14), zx: bit(inst, 13), nx: bit(inst, 12), zy: bit(inst, 11), ny: bit(inst, 10), ci: bit(inst, 9),
          f: (inst >>> 7) & 3, sh: bit(inst, 6), jl: C & bit(inst, 2), je: C & bit(inst, 1), jg: C & bit(inst, 0),
        };
      },
    },
  });

  defChip('Jump', {
    about: 'Jump if the result is negative, zero or positive, as the instruction asks.',
    ins: { jl: 1, je: 1, jg: 1, zr: 1, ng: 1 }, outs: { jump: 1 },
    build: (c, p) => {
      const pos = and(c, not(c, p.zr, 'nonzero'), not(c, p.ng, 'nonneg'), 'positive');
      const lt = and(c, p.jl, p.ng, 'lt'), eq = and(c, p.je, p.zr, 'eq'), gt = and(c, p.jg, pos, 'gt');
      return { jump: or(c, or(c, lt, eq, 'lteq'), gt, 'any') };
    },
    test: { comb: p => ({ jump: (p.jl & p.ng) | (p.je & p.zr) | (p.jg & (p.zr ^ 1) & (p.ng ^ 1)) }) },
  });

  defChip('CPU', {
    about: 'The G16: two registers, an ALU and a program counter, one instruction per clock.',
    ins: { inst: 16, inM: 16, reset: 1 }, outs: { outM: 16, writeM: 1, addressM: 16, pc: 16 },
    layout: {
      place: {
        decode: [0, 0], amux: [1, 1], A: [2, 1], ymux: [3, 1], D: [2, 2], alu: [4, 1], jump: [5, 0], pc: [6, 0],
      },
      cols: 7, rows: 3,
    },
    build: (c, p) => {
      const alu = c.wires(16), zr = c.wire(), ng = c.wire();
      const d = c.use('Decode', { inst: p.inst }, 'decode');
      const ain = c.use('Mux16', { a: alu, b: p.inst, sel: d.isA }, 'amux').out;
      const A = c.use('ResetRegister16', { in: ain, load: d.loadA, reset: p.reset }, 'A').out;
      const D = c.use('ResetRegister16', { in: alu, load: d.loadD, reset: p.reset }, 'D').out;
      const y = c.use('Mux16', { a: A, b: p.inM, sel: d.m }, 'ymux').out;
      const r = c.use('ALU', { x: D, y, zx: d.zx, nx: d.nx, zy: d.zy, ny: d.ny, ci: d.ci, f: d.f, sh: d.sh }, 'alu');
      c.bind(alu, r.out); c.bind(zr, r.zr); c.bind(ng, r.ng);
      const jump = c.use('Jump', { jl: d.jl, je: d.je, jg: d.jg, zr, ng }, 'jump').jump;
      const pc = c.use('PC', { a: A, jump, reset: p.reset }, 'pc').out;
      return { outM: alu, writeM: d.writeM, addressM: A, pc };
    },
    // Checked against the ISA reference in tests/03-cpu.test.js.
  });

  G.chips = { aluSpec };
})(globalThis.G2G || (globalThis.G2G = {}));
