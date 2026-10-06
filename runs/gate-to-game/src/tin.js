// tin.js: a compiler for Tin, a small C-like language, to G16 assembly.
//
//   const W = 64;                 compile-time constants
//   var score = 0;                globals (RAM, initialised at start-up)
//   var font[] = {0x7B6F, ...};   arrays, optionally initialised
//   func plot(x, y, c) {          functions with parameters and locals
//     mem[SCREEN + (y << 6) + x] = c;
//   }
//
// Statements: var, =, += -= &= |= ^= <<= >>=, ++, --, if/else, while, for,
// break, continue, return. Expressions use C's operators and precedence,
// with && and || short-circuiting. mem[a] is the whole address space.
// Words are 16 bits; arithmetic wraps. * / % and shifts by a variable call
// a small runtime written in Tin itself (PRELUDE, below).
//
// Every variable, parameter and temporary has a fixed address, as in early
// FORTRAN, so functions cannot recurse; the compiler checks the call graph
// and says so. In return, a call costs a handful of instructions and an
// expression never needs a stack.
'use strict';
(function (G) {
  const PRELUDE = `
// Runtime library: what the CPU has no instruction for.
func __mul(a, b) {
  var r = 0;
  while (b) {
    if (b & 1) r += a;
    a += a;
    b = b >> 1;
  }
  return r;
}
var __rem = 0;
func __udiv(a, b) {
  // a, b in 0..32767; quotient returned, remainder left in __rem
  if (b == 0) { __rem = a; return 0; }
  var d = b;
  var m = 1;
  var q = 0;
  while (d <= a - d) { d += d; m += m; }
  while (m) {
    if (a >= d) { a -= d; q += m; }
    d = d >> 1;
    m = m >> 1;
  }
  __rem = a;
  return q;
}
func __div(a, b) {
  var neg = 0;
  if (a < 0) { a = -a; neg = 1; }
  if (b < 0) { b = -b; neg ^= 1; }
  var q = __udiv(a, b);
  if (neg) return -q;
  return q;
}
func __mod(a, b) {
  var neg = 0;
  if (a < 0) { a = -a; neg = 1; }
  if (b < 0) b = -b;
  __udiv(a, b);
  if (neg) return -__rem;
  return __rem;
}
func __shl(a, n) {
  while (n > 0) { a += a; n--; }
  return a;
}
func __shr(a, n) {
  while (n > 0) { a = a >> 1; n--; }
  return a;
}
`;
  const PRELUDE_LINES = PRELUDE.split('\n').length;

  class TinError extends Error {
    constructor(msg, line, col) { super(line ? `line ${line}${col ? ':' + col : ''}: ${msg}` : msg); this.line = line; this.col = col; }
  }

  // ---- Lexer ---------------------------------------------------------------

  const KEYWORDS = new Set(['const', 'var', 'func', 'if', 'else', 'while', 'for', 'break', 'continue', 'return', 'mem']);
  const PUNCT = ['<<=', '>>=', '&&', '||', '==', '!=', '<=', '>=', '<<', '>>', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '++', '--',
    '+', '-', '*', '/', '%', '&', '|', '^', '~', '!', '<', '>', '=', '(', ')', '{', '}', '[', ']', ',', ';'];

  function lex(src, lineOffset = 0) {
    const toks = [];
    let i = 0, line = 1, col = 1;
    const adv = n => { for (let k = 0; k < n; k++) { if (src[i] === '\n') { line++; col = 1; } else col++; i++; } };
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { adv(1); continue; }
      if (src.startsWith('//', i)) { while (i < src.length && src[i] !== '\n') adv(1); continue; }
      if (src.startsWith('/*', i)) {
        const j = src.indexOf('*/', i + 2);
        if (j < 0) throw new TinError('unterminated comment', line + lineOffset, col);
        adv(j + 2 - i); continue;
      }
      const at = { line: line + lineOffset, col };
      let m;
      if ((m = /^(0x[0-9a-fA-F]+|0b[01]+|\d+)/.exec(src.slice(i, i + 20)))) {
        if (/[A-Za-z_]/.test(src[i + m[0].length] || '')) throw new TinError(`bad number "${src.slice(i, i + m[0].length + 1)}"`, at.line, at.col);
        toks.push({ t: 'num', v: Number(m[0]), ...at }); adv(m[0].length); continue;
      }
      if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i, i + 64)))) {
        toks.push({ t: KEYWORDS.has(m[0]) ? m[0] : 'name', v: m[0], ...at }); adv(m[0].length); continue;
      }
      const p = PUNCT.find(p => src.startsWith(p, i));
      if (!p) throw new TinError(`unexpected character "${c}"`, at.line, at.col);
      toks.push({ t: p, v: p, ...at }); adv(p.length);
    }
    toks.push({ t: 'eof', v: '', line: line + lineOffset, col });
    return toks;
  }

  // ---- Parser --------------------------------------------------------------

  const BINARY = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '<=', '>', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];

  function parse(toks) {
    let p = 0;
    const peek = (k = 0) => toks[p + k];
    const next = () => toks[p++];
    const is = t => peek().t === t;
    const expect = (t, what) => {
      if (!is(t)) { const k = peek(); throw new TinError(`expected ${what || `"${t}"`} but found ${k.t === 'eof' ? 'the end' : `"${k.v}"`}`, k.line, k.col); }
      return next();
    };
    const node = (k, at, f) => Object.assign({ k, line: at.line, col: at.col }, f);

    function primary() {
      const t = peek();
      if (is('num')) { next(); return node('num', t, { v: t.v }); }
      if (is('(')) { next(); const e = expr(); expect(')'); return e; }
      if (is('mem')) { next(); expect('['); const i = expr(); expect(']'); return node('mem', t, { index: i }); }
      if (is('name')) {
        next();
        if (is('(')) {
          next();
          const args = [];
          if (!is(')')) { do args.push(expr()); while (is(',') && next()); }
          expect(')');
          return node('call', t, { name: t.v, args });
        }
        if (is('[')) { next(); const i = expr(); expect(']'); return node('index', t, { name: t.v, index: i }); }
        return node('name', t, { name: t.v });
      }
      throw new TinError(`expected an expression but found ${t.t === 'eof' ? 'the end' : `"${t.v}"`}`, t.line, t.col);
    }
    function unary() {
      const t = peek();
      if (is('-') || is('~') || is('!')) { next(); return node('unary', t, { op: t.t, e: unary() }); }
      return primary();
    }
    function level(i) {
      if (i === BINARY.length) return unary();
      let l = level(i + 1);
      while (BINARY[i].includes(peek().t)) {
        const t = next();
        l = node('bin', t, { op: t.t, l, r: level(i + 1) });
      }
      return l;
    }
    const expr = () => level(0);

    function lvalue(e) {
      if (e.k === 'name' || e.k === 'index' || e.k === 'mem') return e;
      throw new TinError('this cannot be assigned to', e.line, e.col);
    }

    // A "simple" statement: assignment, ++/--, a call, or a var declaration.
    function simple(allowVar) {
      const t = peek();
      if (allowVar && is('var')) return varDecl(false);
      const e = expr();
      if (is('=')) { next(); return node('assign', t, { target: lvalue(e), value: expr() }); }
      const ops = { '+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': '%', '&=': '&', '|=': '|', '^=': '^', '<<=': '<<', '>>=': '>>' };
      if (peek().t in ops) {
        const op = ops[next().t];
        return node('assign', t, { target: lvalue(e), value: node('bin', t, { op, l: e, r: expr() }) });
      }
      if (is('++') || is('--')) {
        const op = next().t === '++' ? '+' : '-';
        return node('assign', t, { target: lvalue(e), value: node('bin', t, { op, l: e, r: node('num', t, { v: 1 }) }) });
      }
      if (e.k !== 'call') throw new TinError('this expression does nothing; expected an assignment or a call', t.line, t.col);
      return node('expr', t, { e });
    }

    function varDecl(global) {
      const t = expect('var');
      const name = expect('name', 'a variable name').v;
      let size = null, init = null, list = null;
      if (is('[')) {
        next();
        size = is(']') ? 'auto' : expr();
        expect(']');
        if (is('=')) {
          next(); expect('{');
          list = [];
          if (!is('}')) { do list.push(expr()); while (is(',') && next() && !is('}')); }
          expect('}');
        }
      } else if (is('=')) { next(); init = expr(); }
      return node('var', t, { name, size, init, list, global });
    }

    function block() {
      const t = expect('{');
      const body = [];
      while (!is('}')) { if (is('eof')) throw new TinError('missing "}"', t.line, t.col); body.push(stmt()); }
      next();
      return node('block', t, { body });
    }

    function stmt() {
      const t = peek();
      switch (t.t) {
        case '{': return block();
        case 'var': { const d = varDecl(false); expect(';'); return d; }
        case 'if': {
          next(); expect('('); const c = expr(); expect(')');
          const then = stmt();
          let els = null;
          if (is('else')) { next(); els = stmt(); }
          return node('if', t, { c, then, els });
        }
        case 'while': { next(); expect('('); const c = expr(); expect(')'); return node('while', t, { c, body: stmt() }); }
        case 'for': {
          next(); expect('(');
          const init = is(';') ? null : simple(true); expect(';');
          const c = is(';') ? null : expr(); expect(';');
          const step = is(')') ? null : simple(false); expect(')');
          return node('for', t, { init, c, step, body: stmt() });
        }
        case 'break': case 'continue': next(); expect(';'); return node(t.t, t, {});
        case 'return': { next(); const e = is(';') ? null : expr(); expect(';'); return node('return', t, { e }); }
        default: { const s = simple(false); expect(';'); return s; }
      }
    }

    const decls = [];
    while (!is('eof')) {
      const t = peek();
      if (is('const')) {
        next();
        const name = expect('name', 'a constant name').v;
        expect('='); const e = expr(); expect(';');
        decls.push(node('const', t, { name, e }));
      } else if (is('var')) {
        const d = varDecl(true); expect(';'); decls.push(d);
      } else if (is('func')) {
        next();
        const name = expect('name', 'a function name').v;
        expect('(');
        const params = [];
        if (!is(')')) { do params.push(expect('name', 'a parameter name').v); while (is(',') && next()); }
        expect(')');
        decls.push(node('func', t, { name, params, body: block() }));
      } else throw new TinError(`expected const, var or func but found "${t.v}"`, t.line, t.col);
    }
    return decls;
  }

  // ---- Constant folding ----------------------------------------------------

  const s16 = v => ((v & 0xFFFF) ^ 0x8000) - 0x8000;
  function foldOp(op, a, b) {
    a = s16(a); b = s16(b);
    switch (op) {
      case '+': return s16(a + b); case '-': return s16(a - b);
      case '*': return s16(Math.imul(a, b));
      case '/': return b === 0 ? 0 : s16(Math.trunc(a / b));
      case '%': return b === 0 ? s16(a) : s16(a % b);
      case '&': return s16(a & b); case '|': return s16(a | b); case '^': return s16(a ^ b);
      case '<<': return b >= 16 || b < 0 ? 0 : s16(a << b);
      case '>>': return b >= 16 || b < 0 ? 0 : s16((a & 0xFFFF) >>> b);
      case '<': return +(a < b); case '<=': return +(a <= b); case '>': return +(a > b); case '>=': return +(a >= b);
      case '==': return +(a === b); case '!=': return +(a !== b);
      case '&&': return +(a !== 0 && b !== 0); case '||': return +(a !== 0 || b !== 0);
    }
    throw new Error(op);
  }

  // ---- Compiler ------------------------------------------------------------

  function compile(source, opts = {}) {
    const userDecls = parse(lex(source));
    const preDecls = parse(lex(PRELUDE, -PRELUDE_LINES - 1));   // prelude lines are negative
    const decls = [...preDecls, ...userDecls];

    const consts = new Map(), globals = new Map(), funcs = new Map();
    const dup = (name, d) => {
      if (consts.has(name) || globals.has(name) || funcs.has(name)) throw new TinError(`"${name}" is already defined`, d.line, d.col);
      if (name === 'mem') throw new TinError('"mem" is reserved', d.line, d.col);
    };
    let ram = opts.ramBase || 0;
    const symbols = [];   // [asmName, address, info]

    const fold = (e, scope) => {
      if (!e) return e;
      switch (e.k) {
        case 'num': return e;
        case 'name': {
          if (scope && scope.has(e.name)) return e;
          if (consts.has(e.name)) return { ...e, k: 'num', v: consts.get(e.name) };
          return e;
        }
        case 'unary': {
          const x = fold(e.e, scope);
          if (x.k === 'num') return { ...e, k: 'num', v: e.op === '-' ? s16(-x.v) : e.op === '~' ? s16(~x.v) : +(s16(x.v) === 0) };
          return { ...e, e: x };
        }
        case 'bin': {
          const l = fold(e.l, scope), r = fold(e.r, scope);
          if (l.k === 'num' && r.k === 'num') return { ...e, k: 'num', v: foldOp(e.op, l.v, r.v) };
          return { ...e, l, r };
        }
        case 'index': return { ...e, index: fold(e.index, scope) };
        case 'mem': return { ...e, index: fold(e.index, scope) };
        case 'call': return { ...e, args: e.args.map(a => fold(a, scope)) };
      }
      return e;
    };
    const constValue = (e, what) => {
      const f = fold(e, null);
      if (f.k !== 'num') throw new TinError(`${what} must be a constant`, e.line, e.col);
      return f.v;
    };

    for (const d of decls) {
      if (d.k === 'const') { dup(d.name, d); consts.set(d.name, constValue(d.e, 'a const')); }
    }
    // Which runtime routine, if any, a (folded) binary expression calls.
    const pow2 = v => { const u = v & 0xFFFF; return u && !(u & (u - 1)) ? Math.log2(u) : -1; };
    const runtimeCall = e => {
      if (e.k !== 'bin') return null;
      if (e.op === '*') return (e.r.k === 'num' && pow2(e.r.v) >= 0) || (e.l.k === 'num' && pow2(e.l.v) >= 0) ? null : '__mul';
      if (e.op === '/') return '__div';
      if (e.op === '%') return '__mod';
      if (e.op === '<<' || e.op === '>>') return e.r.k === 'num' ? null : e.op === '<<' ? '__shl' : '__shr';
      return null;
    };
    const allocVar = (d, prefix) => {
      let size = 1, isArray = false;
      if (d.size !== null) {
        isArray = true;
        if (d.size === 'auto') {
          if (!d.list) throw new TinError(`array "${d.name}" needs a size or an initialiser`, d.line, d.col);
          size = d.list.length;
        } else size = constValue(d.size, 'an array size');
        if (size < 1) throw new TinError('an array needs at least one element', d.line, d.col);
        if (d.list && d.list.length > size) throw new TinError(`too many initialisers for "${d.name}"`, d.line, d.col);
      }
      const v = { name: d.name, addr: ram, size, isArray, asm: `${prefix}${d.name}`, decl: d };
      ram += size;
      if (ram > G.isa.MAP.RAM_WORDS) throw new TinError('out of RAM', d.line, d.col);
      symbols.push([v.asm, v.addr, v]);
      return v;
    };
    for (const d of decls) {
      if (d.k === 'var') { dup(d.name, d); globals.set(d.name, allocVar(d, 'v.')); }
      else if (d.k === 'func') { dup(d.name, d); funcs.set(d.name, { decl: d, name: d.name, calls: new Set() }); }
    }
    if (!funcs.has('main')) throw new TinError('there is no func main()');

    // Resolve each function's locals and its calls, before generating code,
    // so the call graph can be checked for recursion.
    for (const f of funcs.values()) {
      const d = f.decl;
      f.locals = new Map();
      f.params = d.params.map(p => {
        if (f.locals.has(p)) throw new TinError(`parameter "${p}" given twice`, d.line, d.col);
        const v = allocVar({ name: p, size: null, line: d.line }, `${f.name}.`);
        f.locals.set(p, v);
        return v;
      });
      const visit = s => {
        if (!s || typeof s !== 'object') return;
        if (Array.isArray(s)) { s.forEach(visit); return; }
        if (s.k === 'var' && !s.global) {
          if (f.locals.has(s.name)) throw new TinError(`"${s.name}" is already defined in ${f.name}`, s.line, s.col);
          if (s.size !== null && s.init) throw new TinError('a local array cannot have a single initialiser', s.line, s.col);
          f.locals.set(s.name, allocVar(s, `${f.name}.`));
        }
        if (s.k === 'call') f.calls.add(s.name);
        const rt = s.k === 'bin' && runtimeCall(fold(s, null));
        if (rt) f.calls.add(rt);
        for (const k in s) if (k !== 'line' && k !== 'col') visit(s[k]);
      };
      visit(d.body);
      f.retAddr = ram++;
      symbols.push([`${f.name}.$ret`, f.retAddr, null]);
    }
    const globalCalls = new Set();
    for (const d of decls) if (d.k === 'var') {
      const scan = e => { if (!e || typeof e !== 'object') return; if (e.k === 'call') globalCalls.add(e.name); for (const k in e) if (k !== 'line') scan(e[k]); };
      scan(d.init); scan(d.list);
    }

    // Reachable functions, and no cycles among them.
    const reach = new Set();
    const walk = (name, stack, at) => {
      const f = funcs.get(name);
      if (!f) return;
      if (stack.includes(name)) {
        const cyc = [...stack.slice(stack.indexOf(name)), name].join(' -> ');
        throw new TinError(`recursion is not supported (${cyc}): every variable has one fixed address`, at.line, at.col);
      }
      if (reach.has(name)) return;
      for (const c of f.calls) walk(c, [...stack, name], f.decl);
      reach.add(name);
    };
    walk('main', [], funcs.get('main').decl);
    for (const c of globalCalls) walk(c, [], { line: 0 });

    // ---- Code generation ----

    const out = [];
    let labelN = 0, curLine = null;
    const emit = s => out.push('    ' + s);
    const label = l => out.push(l + ':');
    const newLabel = () => `L${labelN++}`;
    const at = line => { if (line !== curLine && line !== undefined) { out.push(`.line ${line}`); curLine = line; } };

    let fn = null;      // current function
    const loops = [];
    const tempName = i => {
      if (i >= fn.temps) fn.temps = i + 1;
      return `${fn.name}.$t${i}`;
    };

    const lookup = (name, e) => {
      if (fn && fn.locals.has(name)) return fn.locals.get(name);
      if (globals.has(name)) return globals.get(name);
      if (consts.has(name)) return { konst: consts.get(name) };
      if (funcs.has(name)) throw new TinError(`"${name}" is a function; call it with ()`, e.line, e.col);
      throw new TinError(`"${name}" is not defined`, e.line, e.col);
    };
    const scope = () => new Set(fn ? fn.locals.keys() : []);

    // Number into D.
    function loadNum(v) {
      const u = v & 0xFFFF;
      if (u === 0) return emit('D = 0');
      if (u === 1) return emit('D = 1');
      if (u === 0xFFFF) return emit('D = -1');
      if (u < 0x8000) { emit(`A = ${u}`); return emit('D = A'); }
      const n = -u & 0xFFFF;
      if (n < 0x8000) { emit(`A = ${n}`); return emit('D = -A'); }
      emit(`A = ${~u & 0xFFFF}`); emit('D = ~A');
    }

    // If e can be put in A or M without touching D, do it and say which.
    function operand(e) {
      if (e.k === 'num') {
        const u = e.v & 0xFFFF;
        if (u < 0x8000) { emit(`A = ${u}`); return 'A'; }
        return null;
      }
      if (e.k === 'name') {
        const v = lookup(e.name, e);
        if (v.konst !== undefined) return operand({ k: 'num', v: v.konst });
        emit(`A = ${v.asm}`);
        return v.isArray ? 'A' : 'M';
      }
      if (e.k === 'index' && e.index.k === 'num') {
        const v = lookup(e.name, e);
        if (!v.isArray) throw new TinError(`"${e.name}" is not an array`, e.line, e.col);
        emit(`A = ${v.asm}+${e.index.v & 0xFFFF}`); return 'M';
      }
      if (e.k === 'mem' && e.index.k === 'num' && (e.index.v & 0xFFFF) < 0x8000) { emit(`A = ${e.index.v & 0xFFFF}`); return 'M'; }
      return null;
    }
    const isOperand = e => e.k === 'num' ? (e.v & 0xFFFF) < 0x8000
      : e.k === 'name' ? true
      : (e.k === 'index' && e.index.k === 'num') || (e.k === 'mem' && e.index.k === 'num' && (e.index.v & 0xFFFF) < 0x8000);

    const ALU_OPS = { '+': '+', '-': '-', '&': '&', '|': '|', '^': '^' };
    const COMPARE = new Set(['<', '<=', '>', '>=', '==', '!=']);

    // Expression into D. t is the first free temporary.
    function gen(e, t = 0) {
      switch (e.k) {
        case 'num': return loadNum(e.v);
        case 'name': {
          const v = lookup(e.name, e);
          if (v.konst !== undefined) return loadNum(v.konst);
          emit(`A = ${v.asm}`);
          return emit(v.isArray ? 'D = A' : 'D = M');
        }
        case 'index': {
          const v = lookup(e.name, e);
          if (!v.isArray) throw new TinError(`"${e.name}" is not an array`, e.line, e.col);
          if (e.index.k === 'num') { emit(`A = ${v.asm}+${e.index.v & 0xFFFF}`); return emit('D = M'); }
          gen(e.index, t);
          emit(`A = ${v.asm}`); emit('A = D + A'); return emit('D = M');
        }
        case 'mem': {
          if (isOperand(e)) { operand(e); return emit('D = M'); }
          gen(e.index, t); emit('A = D'); return emit('D = M');
        }
        case 'unary':
          if (e.op === '!') return condValue(e, t);
          gen(e.e, t);
          return emit(e.op === '-' ? 'D = -D' : 'D = ~D');
        case 'call': return call(e, t);
        case 'bin': return binary(e, t);
      }
      throw new TinError('cannot compile this expression', e.line, e.col);
    }

    function binary(e, t) {
      const { op, l, r } = e;
      if (COMPARE.has(op) || op === '&&' || op === '||') return condValue(e, t);
      if (op === '*') {
        if (r.k === 'num' && pow2(r.v) >= 0) return binary({ ...e, op: '<<', r: { k: 'num', v: pow2(r.v) } }, t);
        if (l.k === 'num' && pow2(l.v) >= 0) return binary({ ...e, op: '<<', l: r, r: { k: 'num', v: pow2(l.v) } }, t);
        return call({ ...e, k: 'call', name: '__mul', args: [l, r] }, t);
      }
      if (op === '/' || op === '%') return call({ ...e, k: 'call', name: op === '/' ? '__div' : '__mod', args: [l, r] }, t);
      if (op === '<<' || op === '>>') {
        if (r.k !== 'num') return call({ ...e, k: 'call', name: op === '<<' ? '__shl' : '__shr', args: [l, r] }, t);
        const n = r.v & 0xFFFF;
        if (n >= 16) return emit('D = 0');
        gen(l, t);
        for (let i = 0; i < n; i++) {
          if (op === '<<') { emit('A = D'); emit('D = D + A'); } else emit('D = D >> 1');
        }
        return;
      }
      const sym = ALU_OPS[op];
      if (!sym) throw new TinError(`unknown operator ${op}`, e.line, e.col);
      if (isOperand(r)) {
        gen(l, t);
        const y = operand(r);
        return emit(`D = D ${sym} ${y}`);
      }
      if (isOperand(l)) {
        gen(r, t);
        const y = operand(l);
        return emit(`D = ${y} ${sym} D`);
      }
      gen(l, t);
      const tmp = tempName(t);
      emit(`A = ${tmp}`); emit('M = D');
      gen(r, t + 1);
      emit(`A = ${tmp}`); emit(`D = M ${sym} D`);
    }

    const JUMP_IF = { '<': 'jlt', '<=': 'jle', '>': 'jgt', '>=': 'jge', '==': 'jeq', '!=': 'jne' };
    const NEGATE = { '<': '>=', '<=': '>', '>': '<=', '>=': '<', '==': '!=', '!=': '==' };

    // Jump to target if e is true (sense) or false (!sense).
    function cond(e, target, sense, t) {
      if (e.k === 'num') {
        if ((s16(e.v) !== 0) === sense) { emit(`A = ${target}`); emit('0 ; jmp'); }
        return;
      }
      if (e.k === 'unary' && e.op === '!') return cond(e.e, target, !sense, t);
      if (e.k === 'bin' && (e.op === '&&' || e.op === '||')) {
        const both = e.op === '&&';
        if (both !== sense) { cond(e.l, target, sense, t); return cond(e.r, target, sense, t); }
        const skip = newLabel();
        cond(e.l, skip, !sense, t); cond(e.r, target, sense, t);
        return label(skip);
      }
      if (e.k === 'bin' && COMPARE.has(e.op)) {
        if (e.r.k === 'num' && (e.r.v & 0xFFFF) === 0) gen(e.l, t);
        else gen({ ...e, op: '-' }, t);
        emit(`A = ${target}`);
        return emit(`D ; ${JUMP_IF[sense ? e.op : NEGATE[e.op]]}`);
      }
      gen(e, t);
      emit(`A = ${target}`);
      emit(`D ; ${sense ? 'jne' : 'jeq'}`);
    }

    function condValue(e, t) {
      const yes = newLabel(), end = newLabel();
      cond(e, yes, true, t);
      emit('D = 0'); emit(`A = ${end}`); emit('0 ; jmp');
      label(yes); emit('D = 1');
      label(end);
    }

    const hasCall = e => !!e && typeof e === 'object' && (e.k === 'call' || !!runtimeCall(e)
      || Object.values(e).some(v => typeof v === 'object' && hasCall(v)));

    function call(e, t) {
      const f = funcs.get(e.name);
      if (!f) throw new TinError(`"${e.name}" is not a function`, e.line, e.col);
      if (e.args.length !== f.params.length) throw new TinError(`${e.name}() takes ${f.params.length} argument${f.params.length === 1 ? '' : 's'}, not ${e.args.length}`, e.line, e.col);
      if (e.args.some(hasCall)) {
        e.args.forEach((a, i) => { gen(a, t + i); emit(`A = ${tempName(t + i)}`); emit('M = D'); });
        e.args.forEach((a, i) => { emit(`A = ${tempName(t + i)}`); emit('D = M'); emit(`A = ${f.params[i].asm}`); emit('M = D'); });
      } else {
        e.args.forEach((a, i) => store(f.params[i].asm, a, t));
      }
      const ret = newLabel();
      emit(`A = ${ret}`); emit('D = A');
      emit(`A = ${e.name}.$ret`); emit('M = D');
      emit(`A = ${e.name}`); emit('0 ; jmp');
      label(ret);
    }

    // Store an expression into a fixed address.
    function store(asmAddr, value, t) {
      if (value.k === 'num' && [0, 1, 0xFFFF].includes(value.v & 0xFFFF)) {
        emit(`A = ${asmAddr}`); return emit(`M = ${{ 0: '0', 1: '1', 65535: '-1' }[value.v & 0xFFFF]}`);
      }
      gen(value, t);
      emit(`A = ${asmAddr}`); emit('M = D');
    }

    const sameVar = (a, b) => a.k === 'name' && b.k === 'name' && a.name === b.name;

    function assign(s) {
      const target = s.target;
      let value = fold(s.value, scope());
      if (target.k === 'name') {
        const v = lookup(target.name, target);
        if (v.konst !== undefined) throw new TinError(`"${target.name}" is a constant`, target.line, target.col);
        if (v.isArray) throw new TinError(`"${target.name}" is an array; assign to an element`, target.line, target.col);
        // x = x op e: compute e, then update x in place.
        if (value.k === 'bin' && ALU_OPS[value.op] && sameVar(value.l, target) && !hasCall(value.r)) {
          const r = value.r;
          if (r.k === 'num' && (r.v & 0xFFFF) === 1 && (value.op === '+' || value.op === '-')) {
            emit(`A = ${v.asm}`); return emit(`M = M ${value.op} 1`);
          }
          gen(r, 0);
          emit(`A = ${v.asm}`); return emit(`M = M ${ALU_OPS[value.op]} D`);
        }
        return store(v.asm, value, 0);
      }
      // Element of an array, or mem[]: work out the address.
      let addr, base = null;
      if (target.k === 'index') {
        const v = lookup(target.name, target);
        if (!v.isArray) throw new TinError(`"${target.name}" is not an array`, target.line, target.col);
        const i = fold(target.index, scope());
        if (i.k === 'num') return store(`${v.asm}+${i.v & 0xFFFF}`, value, 0);
        addr = i; base = v.asm;
      } else {
        const i = fold(target.index, scope());
        if (i.k === 'num' && (i.v & 0xFFFF) < 0x8000) return store(`${i.v & 0xFFFF}`, value, 0);
        addr = i;
      }
      const genAddr = t => { gen(addr, t); if (base) { emit(`A = ${base}`); emit('D = D + A'); } };
      if (value.k === 'num' && [0, 1, 0xFFFF].includes(value.v & 0xFFFF)) {
        genAddr(0); emit('A = D');
        return emit(`M = ${{ 0: '0', 1: '1', 65535: '-1' }[value.v & 0xFFFF]}`);
      }
      genAddr(0);
      const tmp = tempName(0);
      emit(`A = ${tmp}`); emit('M = D');
      gen(value, 1);
      emit(`A = ${tmp}`); emit('A = M'); emit('M = D');
    }

    function statement(s) {
      at(s.line);
      switch (s.k) {
        case 'block': return s.body.forEach(statement);
        case 'var': {
          if (s.size !== null) {
            if (s.list) s.list.forEach((x, i) => assign({ target: { k: 'index', name: s.name, index: { k: 'num', v: i }, line: s.line }, value: x }));
            return;
          }
          if (s.init) return assign({ target: { k: 'name', name: s.name, line: s.line }, value: s.init });
          return;
        }
        case 'assign': return assign(s);
        case 'expr': return gen(fold(s.e, scope()), 0);
        case 'if': {
          const c = fold(s.c, scope());
          const els = newLabel();
          cond(c, els, false, 0);
          statement(s.then);
          if (s.els) {
            const end = newLabel();
            at(s.line); emit(`A = ${end}`); emit('0 ; jmp');
            label(els); statement(s.els); label(end);
          } else label(els);
          return;
        }
        case 'while': case 'for': {
          if (s.k === 'for' && s.init) statement(s.init);
          const top = newLabel(), next = newLabel(), end = newLabel();
          label(top);
          at(s.line);
          if (s.c) cond(fold(s.c, scope()), end, false, 0);
          loops.push({ brk: end, cont: next });
          statement(s.body);
          loops.pop();
          label(next);
          if (s.k === 'for' && s.step) statement(s.step);
          at(s.line);
          emit(`A = ${top}`); emit('0 ; jmp');
          label(end);
          return;
        }
        case 'break': case 'continue': {
          if (!loops.length) throw new TinError(`${s.k} outside a loop`, s.line, s.col);
          const l = loops[loops.length - 1];
          emit(`A = ${s.k === 'break' ? l.brk : l.cont}`); return emit('0 ; jmp');
        }
        case 'return': {
          if (!fn) throw new TinError('return outside a function', s.line, s.col);
          if (s.e) gen(fold(s.e, scope()), 0);
          emit(`A = ${fn.name}.$ret`); emit('A = M'); return emit('0 ; jmp');
        }
      }
      throw new TinError(`cannot compile a ${s.k} statement`, s.line, s.col);
    }

    // Start-up: initialise globals, call main, then stop.
    out.push('# G16 assembly generated by the Tin compiler');
    out.push('.line 0');
    curLine = 0;
    label('__start');
    fn = { name: '__init', locals: new Map(), temps: 0 };
    for (const d of userDecls.concat(preDecls)) if (d.k === 'var') statement({ ...d, global: true });
    const initTemps = fn.temps;
    at(0);
    statement({ k: 'expr', e: { k: 'call', name: 'main', args: [], line: 0 }, line: 0 });
    label('__halt');
    emit('A = __halt'); emit('0 ; jmp');

    const ranges = [];
    const ordered = [...userDecls, ...preDecls].filter(d => d.k === 'func' && reach.has(d.name));
    for (const d of ordered) {
      fn = funcs.get(d.name);
      fn.temps = 0;
      loops.length = 0;
      curLine = null;
      out.push(`# func ${d.name}(${d.params.join(', ')})`);
      at(d.line);
      label(d.name);
      ranges.push({ name: d.name, label: d.name, line: d.line });
      statement(d.body);
      at(d.body.line);
      emit(`A = ${d.name}.$ret`); emit('A = M'); emit('0 ; jmp');
    }

    // Temporaries are allocated last, now that each function's count is known.
    const equs = [];
    for (const [name, addr] of symbols) equs.push(`.equ ${name} ${addr}`);
    const tempsOf = [['__init', initTemps], ...ordered.map(d => [d.name, funcs.get(d.name).temps])];
    for (const [name, n] of tempsOf) for (let i = 0; i < n; i++) { equs.push(`.equ ${name}.$t${i} ${ram}`); ram++; }
    if (ram > G.isa.MAP.RAM_WORDS) throw new TinError('out of RAM for temporaries');

    const asm = [...equs, ...out].join('\n') + '\n';
    let prog;
    try { prog = G.asm.assemble(asm); }
    catch (e) { throw new Error('internal error: generated assembly did not assemble:\n' + e.message); }
    const fnAt = [];
    for (const r of ranges) fnAt.push({ name: r.name, start: prog.labels.get(r.label), line: r.line });
    fnAt.sort((a, b) => a.start - b.start);
    return {
      asm, rom: prog.words, program: prog, functions: fnAt, ramUsed: ram, source,
      globals: [...globals.values()].map(v => ({ name: v.name, addr: v.addr, size: v.size })),
      prelude: PRELUDE,
    };
  }

  G.tin = { compile, lex, parse, TinError, PRELUDE };
})(globalThis.G2G || (globalThis.G2G = {}));
