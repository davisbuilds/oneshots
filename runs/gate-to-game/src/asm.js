// asm.js: the G16 assembler and disassembler.
//
// Syntax, one instruction per line, `#` starts a comment:
//
//   loop:                 a label (its ROM address)
//   A = 1234              load a number 0..32767, a label or a .equ symbol
//   D = D + M             compute; destinations are any of A, D, M
//   AM = M - 1
//   D ; jgt               compute D, jump to A if it is > 0
//   0 ; jmp               jump to A
//   D + A                 computes and discards: a no-op
//   M = (D + M) >> 1      the ALU's optional shift right
//   .equ SCREEN 16384     define a symbol
//   .line 42              following instructions came from source line 42
//
// Instead of a table of allowed forms, the assembler evaluates the expression
// on a set of test operands and looks for the ALU control setting that
// behaves the same way. Any expression the ALU can compute is accepted, and
// anything it cannot is an error that says so.
'use strict';
(function (G) {
  const { alu, JUMPS, JUMP_NAMES, M16 } = G.isa;

  // ---- Expressions over D and Y (Y is A or M) -----------------------------

  function tokenize(src) {
    const toks = [];
    const re = /\s*(>>|0x[0-9a-fA-F]+|0b[01]+|\d+|[A-Za-z_.$][\w.$]*|[-+~&|^()])/y;
    let m, i = 0;
    while (i < src.length) {
      re.lastIndex = i;
      if (!(m = re.exec(src))) { if (/^\s*$/.test(src.slice(i))) break; throw new Error(`cannot read "${src.slice(i).trim()}"`); }
      toks.push(m[1]); i = re.lastIndex;
    }
    return toks;
  }

  // Precedence, low to high: >>  |  ^  &  + -  unary
  function parseExpr(src) {
    const t = tokenize(src);
    let p = 0;
    const peek = () => t[p], next = () => t[p++];
    const bin = (sub, ops) => () => {
      let l = sub();
      while (ops.includes(peek())) { const op = next(); const r = sub(); l = { op, l, r }; }
      return l;
    };
    const unary = () => {
      const k = peek();
      if (k === '-' || k === '~') { next(); return { op: 'u' + k, l: unary() }; }
      if (k === '(') { next(); const e = shift(); if (next() !== ')') throw new Error('missing )'); return e; }
      if (k === undefined) throw new Error('expression ends early');
      next();
      if (k === 'D' || k === 'A' || k === 'M') return { reg: k };
      if (/^(0x|0b|\d)/.test(k)) return { num: Number(k) };
      throw new Error(`"${k}" is not D, A, M or a number`);
    };
    const add = bin(unary, ['+', '-']), and = bin(add, ['&']), xor = bin(and, ['^']), or = bin(xor, ['|']);
    const shift = () => {
      let l = or();
      while (peek() === '>>') { next(); const r = or(); l = { op: '>>', l, r }; }
      return l;
    };
    const e = shift();
    if (p < t.length) throw new Error(`unexpected "${t[p]}"`);
    return e;
  }

  function regs(e, set = new Set()) {
    if (e.reg) set.add(e.reg);
    if (e.l) regs(e.l, set);
    if (e.r) regs(e.r, set);
    return set;
  }

  function evalExpr(e, D, Y) {
    if (e.reg) return e.reg === 'D' ? D : Y;
    if ('num' in e) return e.num & M16;
    const l = evalExpr(e.l, D, Y);
    switch (e.op) {
      case 'u-': return -l & M16;
      case 'u~': return ~l & M16;
    }
    const r = evalExpr(e.r, D, Y);
    switch (e.op) {
      case '+': return (l + r) & M16;
      case '-': return (l - r) & M16;
      case '&': return l & r;
      case '|': return l | r;
      case '^': return l ^ r;
      case '>>': return r === 1 ? l >>> 1 : NaN;   // the ALU only shifts by one
    }
    throw new Error('bad operator');
  }

  // Test operands: corner cases plus a fixed pseudo-random set.
  const VECS = (() => {
    const v = [[0, 0], [1, 0], [0, 1], [M16, 0], [0, M16], [0x8000, 1], [0x7FFF, 0x7FFF], [M16, M16], [0x5555, 0xAAAA], [3, 5]];
    let x = 12345;
    for (let i = 0; i < 30; i++) { x = (x * 1103515245 + 12345) >>> 0; const a = x >>> 16; x = (x * 1103515245 + 12345) >>> 0; v.push([a, x >>> 16]); }
    return v;
  })();
  const sig = f => VECS.map(([d, y]) => f(d, y)).join(',');

  // Signature of every one of the 256 control settings; the first one found
  // for a signature is the one the assembler emits.
  const BY_SIG = new Map();
  for (let ctl = 0; ctl < 256; ctl++) {
    const k = sig((d, y) => alu(d, y, ctl));
    if (!BY_SIG.has(k)) BY_SIG.set(k, ctl);
  }

  // Readable names for disassembly: the simplest expression for each setting.
  const NAMES = new Map();
  (() => {
    const atoms = ['0', '1', '-1', 'D', 'Y', '~D', '~Y', '-D', '-Y'];
    const pairs = ['D+Y', 'D-Y', 'Y-D', 'D&Y', 'D|Y', 'D^Y', 'D+1', 'Y+1', 'D-1', 'Y-1', 'D+Y+1', 'D-Y-1', 'Y-D-1',
      '~D&Y', 'D&~Y', '~D|Y', 'D|~Y', '~(D&Y)', '~(D|Y)', '~(D^Y)', '-D-1', '-Y-1', '~D+Y', 'D+~Y', '~D-Y'];
    const list = [...atoms, ...pairs];
    for (const s of [...list, ...list.map(s => (s.length > 2 ? `(${s})` : s) + '>>1')]) {
      let e;
      try { e = parseExpr(s.replace(/Y/g, 'A')); } catch { continue; }
      const k = sig((d, y) => evalExpr(e, d, y));
      if (BY_SIG.has(k) && !NAMES.has(BY_SIG.get(k))) NAMES.set(BY_SIG.get(k), s);
    }
  })();

  function compileExpr(src) {
    const e = parseExpr(src);
    const r = regs(e);
    if (r.has('A') && r.has('M')) throw new Error('an instruction can use A or M, not both');
    const k = sig((d, y) => evalExpr(e, d, y));
    const ctl = BY_SIG.get(k);
    if (ctl === undefined) throw new Error(`the ALU cannot compute "${src.trim()}" in one instruction`);
    return { ctl, m: r.has('M') ? 1 : 0 };
  }

  // ---- Assembler -----------------------------------------------------------

  const SYMBOL = /^[A-Za-z_.$][\w.$]*$/;
  const LOADABLE = /^\s*([A-Za-z_.$][\w.$]*|0x[0-9a-fA-F]+|0b[01]+|\d+)\s*(?:([+-])\s*(\d+))?\s*$/;

  function assemble(text) {
    const lines = text.split('\n');
    const items = [];         // {kind, line, ...}
    const labels = new Map(), equ = new Map();
    const errors = [];
    let pc = 0, srcLine = 0;
    const fail = (i, msg) => errors.push(`line ${i + 1}: ${msg}`);

    lines.forEach((raw, i) => {
      let s = raw.replace(/#.*/, '').trim();
      if (!s) return;
      let m;
      while ((m = /^([A-Za-z_.$][\w.$]*):\s*/.exec(s))) {
        if (labels.has(m[1]) || equ.has(m[1])) fail(i, `"${m[1]}" defined twice`);
        labels.set(m[1], pc);
        s = s.slice(m[0].length);
      }
      if (!s) return;
      if (s.startsWith('.')) {
        const [dir, ...args] = s.split(/\s+/);
        if (dir === '.equ') {
          if (args.length !== 2 || !SYMBOL.test(args[0])) return fail(i, '.equ needs a name and a value');
          if (labels.has(args[0]) || equ.has(args[0])) return fail(i, `"${args[0]}" defined twice`);
          equ.set(args[0], { expr: args[1], line: i });
        } else if (dir === '.line') {
          srcLine = Number(args[0]) || 0;
        } else fail(i, `unknown directive ${dir}`);
        return;
      }
      items.push({ text: s, line: i, srcLine, pc });
      pc++;
    });

    const value = (tok, i) => {
      if (/^(0x|0b|\d)/.test(tok)) return Number(tok);
      if (labels.has(tok)) return labels.get(tok);
      if (equ.has(tok)) {
        const d = equ.get(tok);
        if (d.busy) throw new Error(`"${tok}" is defined in terms of itself`);
        d.busy = true;
        try { return value(d.expr, d.line); } finally { d.busy = false; }
      }
      throw new Error(`unknown symbol "${tok}"`);
    };

    const words = new Uint16Array(items.length);
    const asmLine = new Int32Array(items.length), srcLines = new Int32Array(items.length);
    for (const it of items) {
      asmLine[it.pc] = it.line; srcLines[it.pc] = it.srcLine;
      try { words[it.pc] = encodeLine(it.text, value); } catch (e) { fail(it.line, e.message); }
    }
    if (errors.length) { const e = new Error(errors.join('\n')); e.errors = errors; throw e; }
    const symbols = new Map([...equ.keys()].map(k => [k, value(k)]));
    return { words, asmLine, srcLine: srcLines, labels, symbols, lines };
  }

  function encodeLine(s, value) {
    let dest = '', expr = s, jump = '';
    const semi = s.indexOf(';');
    if (semi >= 0) { jump = s.slice(semi + 1).trim().toLowerCase(); expr = s.slice(0, semi); }
    const eq = expr.indexOf('=');
    if (eq >= 0) { dest = expr.slice(0, eq).trim(); expr = expr.slice(eq + 1); }
    if (!(jump in JUMPS)) throw new Error(`unknown jump "${jump}"`);
    if (!/^[ADM]*$/.test(dest) || new Set(dest).size !== dest.length) throw new Error(`bad destination "${dest}"`);

    // A = <number or symbol>: the load instruction.
    const lm = LOADABLE.exec(expr);
    if (dest === 'A' && !jump && lm && !/^[ADM]$/.test(lm[1])) {
      let v = value(lm[1]);
      if (lm[2]) v = lm[2] === '+' ? v + Number(lm[3]) : v - Number(lm[3]);
      if (!(v >= 0 && v <= 0x7FFF)) throw new Error(`A = ${v}: a load holds 0 to 32767`);
      return v;
    }
    const { ctl, m } = compileExpr(expr);
    const j = JUMPS[jump];
    return G.isa.encodeC({ m, ctl, dA: +dest.includes('A'), dD: +dest.includes('D'), dM: +dest.includes('M'), jl: j >> 2 & 1, je: j >> 1 & 1, jg: j & 1 });
  }

  function disassemble(w) {
    if (!(w & 0x8000)) return `A = ${w}`;
    const d = G.isa.decode(w);
    const y = d.m ? 'M' : 'A';
    let e = NAMES.get(d.ctl);
    if (e === undefined) {
      const c = G.isa.ctlFields(d.ctl);
      const x = c.zx ? (c.nx ? '-1' : '0') : (c.nx ? '~D' : 'D');
      const yy = c.zy ? (c.ny ? '-1' : '0') : (c.ny ? '~Y' : 'Y');
      e = c.f === 0 ? `${x}+${yy}${c.ci ? '+1' : ''}` : `${x}${'+&|^'[c.f]}${yy}`;
      if (c.sh) e = `(${e})>>1`;
    }
    e = e.replace(/Y/g, y);
    const dest = (d.dA ? 'A' : '') + (d.dD ? 'D' : '') + (d.dM ? 'M' : '');
    const j = JUMP_NAMES[d.jl << 2 | d.je << 1 | d.jg];
    return (dest ? `${dest} = ` : '') + e + (j ? ` ; ${j}` : '');
  }

  G.asm = { assemble, disassemble, compileExpr, parseExpr, evalExpr, distinctFunctions: BY_SIG.size };
})(globalThis.G2G || (globalThis.G2G = {}));
