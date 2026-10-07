// Layer 5: the Tin compiler. Programs are compiled, assembled and run on the
// machine until they halt; results are read back from RAM.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/node.js');
const { rng } = require('./util.js');

function run(src, { cpu = 'ref', limit = 2e6 } = {}) {
  const c = G.tin.compile(src);
  const m = new G.machine.Machine(c.rom, { cpu });
  const halt = c.program.labels.get('__halt');
  let n = 0;
  // The halt loop is two instructions: A = __halt, then 0 ; jmp.
  while (m.state().PC !== halt && m.state().PC !== halt + 1) {
    m.run(1000); n += 1000;
    if (n > limit) throw new Error('program did not halt');
  }
  const get = name => m.board.ram[c.globals.find(g => g.name === name).addr];
  const arr = (name, k) => Array.from(m.board.ram.slice(c.globals.find(g => g.name === name).addr).slice(0, k));
  return { c, m, get, arr, cycles: m.cycle };
}
const s16 = v => ((v & 0xFFFF) ^ 0x8000) - 0x8000;

test('arithmetic, precedence and wrapping', () => {
  const r = run(`
    var a = 0; var b = 0; var c = 0; var d = 0; var e = 0; var f = 0;
    func main() {
      var x = 1234; var y = -77;
      a = x + y * 3 - (x - y) / 7;
      b = (x ^ y) & 0x0FF0 | 5;
      c = 32767 + 1;          // wraps
      d = -x >> 3;            // logical shift
      e = x % 100 + (y % 10) * 1000;
      f = ~x + !0 + !x;
    }`);
  const x = 1234, y = -77;
  assert.equal(s16(r.get('a')), s16(x + y * 3 - Math.trunc((x - y) / 7)));
  assert.equal(r.get('b'), ((x ^ y) & 0x0FF0 | 5) & 0xFFFF);
  assert.equal(r.get('c'), 0x8000);
  assert.equal(r.get('d'), ((-x) & 0xFFFF) >>> 3);
  assert.equal(s16(r.get('e')), x % 100 + (y % 10) * 1000);
  assert.equal(s16(r.get('f')), ~x + 1 + 0);
});

test('multiply, divide and modulo agree with JavaScript on random operands', () => {
  const R = rng(11);
  const cases = [];
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(R() * 65535) - 32767, b = Math.floor(R() * 401) - 200 || 7;
    cases.push([a, b]);
  }
  cases.push([0, 5], [5, 0], [32767, 1], [-32767, -1], [100, 100], [99, 100]);
  const src = `
    var A[] = {${cases.map(c => c[0]).join(',')}};
    var B[] = {${cases.map(c => c[1]).join(',')}};
    var P[${cases.length}]; var Q[${cases.length}]; var M[${cases.length}];
    func main() {
      for (var i = 0; i < ${cases.length}; i++) {
        P[i] = A[i] * B[i]; Q[i] = A[i] / B[i]; M[i] = A[i] % B[i];
      }
    }`;
  const r = run(src);
  const n = cases.length;
  cases.forEach(([a, b], i) => {
    assert.equal(s16(r.arr('P', n)[i]), s16(Math.imul(a, b)), `${a} * ${b}`);
    assert.equal(s16(r.arr('Q', n)[i]), s16(b ? Math.trunc(a / b) : 0), `${a} / ${b}`);
    assert.equal(s16(r.arr('M', n)[i]), s16(b ? a % b : a), `${a} % ${b}`);
  });
});

test('control flow: if/else chains, while, for, break, continue, short circuit', () => {
  const r = run(`
    var primes[20]; var count = 0; var calls = 0; var sc = 0; var fizz = 0;
    func noisy(v) { calls++; return v; }
    func main() {
      var n = 2;
      while (count < 20) {
        var p = 1; var d = 2;
        while (d * d <= n) {
          if (n % d == 0) { p = 0; break; }
          d++;
        }
        if (p) { primes[count] = n; count++; }
        n++;
      }
      if (noisy(0) && noisy(1)) sc = 100;
      if (noisy(1) || noisy(1)) sc += 1;
      if (!(noisy(0) || noisy(0)) && noisy(1)) sc += 10;
      for (var i = 1; i <= 30; i++) {
        if (i % 3 != 0) continue;
        if (i % 5 == 0) fizz += 100; else if (i % 2 == 0) fizz += 10; else fizz += 1;
      }
    }`);
  assert.deepEqual(r.arr('primes', 20), [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71]);
  assert.equal(r.get('sc'), 11);
  assert.equal(r.get('calls'), 1 + 1 + 3);   // short circuit skipped four calls
  // multiples of 3 up to 30: 15 and 30 (+100 each), 6 12 18 24 (+10), 3 9 21 27 (+1)
  assert.equal(r.get('fizz'), 200 + 40 + 4);
});

test('functions: arguments, nested calls, return values, globals and mem[]', () => {
  const r = run(`
    const BASE = 1000;
    var out = 0; var out2 = 0; var cmp = 0;
    func add3(a, b, c) { return a + b + c; }
    func sq(x) { return x * x; }
    func max(a, b) { if (a > b) return a; return b; }
    func fill(addr, n, v) { while (n > 0) { mem[addr] = v; addr++; v += 2; n--; } }
    func main() {
      out = add3(sq(3), sq(add3(1, 1, 2)), max(sq(2), 7));    // 9 + 16 + 7
      fill(BASE, 5, 1);
      out2 = mem[BASE] + mem[BASE + 4] * 10;                  // 1 + 9 * 10
      cmp = (3 < 4) + (4 < 3) * 2 + (-1 < 0) * 4 + (5 >= 5) * 8 + (2 != 2) * 16;
    }`);
  assert.equal(r.get('out'), 32);
  assert.equal(r.get('out2'), 91);
  assert.equal(r.get('cmp'), 1 + 4 + 8);
});

test('the compiler refuses what it cannot do, with the line', () => {
  const bad = (src, re) => assert.throws(() => G.tin.compile(src), re);
  bad('func main() { f(); } func f() { main(); }', /recursion is not supported \(main -> f -> main\)/);
  bad('func main() { x = 1; }', /line 1.*"x" is not defined/);
  bad('func main() {\n  var a = 1;\n  var a = 2;\n}', /line 3.*already defined/);
  bad('func f(a) {} func main() { f(1, 2); }', /takes 1 argument, not 2/);
  bad('func main() { break; }', /break outside a loop/);
  bad('const K = 3; func main() { K = 4; }', /is a constant/);
  bad('var x = 0;', /no func main/);
  bad('func main() { 1 + 2; }', /does nothing/);
  bad('func main() { var big[5000]; }', /out of RAM/);
});

test('the same program gives the same results on the gate-level CPU', () => {
  const src = `
    var r[8];
    func main() {
      var x = 7;
      for (var i = 0; i < 8; i++) { x = x * 31 + 11; r[i] = x % 1000; }
    }`;
  const a = run(src), b = run(src, { cpu: 'gates' });
  assert.deepEqual(b.arr('r', 8), a.arr('r', 8));
  assert.equal(b.cycles, a.cycles);
});
