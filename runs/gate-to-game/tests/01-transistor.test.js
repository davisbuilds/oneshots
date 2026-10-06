// Layer 1: four transistors make a NAND, and NAND cells compose.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/node.js');
const { rng, randBits } = require('./util.js');
const T = G.transistor;

test('the CMOS cell computes NAND, never floats and never shorts', () => {
  for (const [a, b, want] of [[0, 0, 1], [0, 1, 1], [1, 0, 1], [1, 1, 0]]) {
    const c = T.nandCell(a, b);
    assert.equal(c.out, want, `NAND(${a}, ${b})`);
    // Exactly one of the two networks conducts: either some PMOS is on or both NMOS are.
    const up = c.transistors.filter(t => t.type === 'p' && t.on).length > 0;
    const down = c.transistors.filter(t => t.type === 'n' && t.on).length === 2;
    assert.notEqual(up, down, 'pull-up and pull-down must be complementary');
  }
});

test('the switch solver notices a broken cell', () => {
  // Remove one PMOS: with a = 0 and b = 1 nothing pulls the output up.
  const broken = T.NAND_CELL.filter(t => t.name !== 'P1');
  assert.equal(T.solve(broken, { VDD: 1, GND: 0, a: 0, b: 1 }).get('out'), 'Z');
  // Wire both NMOS in parallel instead of in series: a = 1, b = 0 now shorts.
  const shorted = T.NAND_CELL.map(t => t.name === 'N1' ? { ...t, src: 'GND' } : t);
  assert.equal(T.solve(shorted, { VDD: 1, GND: 0, a: 1, b: 0 }).get('out'), 'X');
});

function transistorLevel(name, vectors) {
  // Expand a whole chip into transistors and compare with the gate simulator.
  const spec = G.hdl.CHIPS[name];
  const nl = G.hdl.build(name);
  const ts = T.expand(nl);
  const sim = G.sim.create(nl);
  for (const v of vectors) {
    const fixed = { n0: 0, n1: 1 };
    for (const p of spec.inOrder) {
      const nets = [].concat(nl.inputs[p]);
      nets.forEach((n, i) => { fixed['n' + n] = (v[p] >>> i) & 1; });
      G.sim.setter(nl.inputs[p])(sim.s, v[p]);
    }
    sim.settle();
    const val = T.solve(ts, fixed);
    for (let g = 0; g < nl.nGates; g++) {
      const o = nl.gOut[g];
      assert.equal(val.get('n' + o), sim.s[o], `${name} net ${o} for ${JSON.stringify(v)}`);
    }
  }
  return ts.length;
}

test('a full adder built from 36 transistors agrees with the gates, exhaustively', () => {
  const v = [];
  for (let i = 0; i < 8; i++) v.push({ a: i & 1, b: i >> 1 & 1, cin: i >> 2 });
  assert.equal(transistorLevel('FullAdder', v), 36);
});

test('the whole ALU at transistor level agrees with the gates', () => {
  const r = rng(3);
  const v = [];
  for (let i = 0; i < 40; i++) {
    v.push({ x: randBits(r, 16), y: randBits(r, 16), zx: randBits(r, 1), nx: randBits(r, 1), zy: randBits(r, 1), ny: randBits(r, 1), ci: randBits(r, 1), f: randBits(r, 2), sh: randBits(r, 1) });
  }
  const n = transistorLevel('ALU', v);
  assert.equal(n, 784 * 4);
});
