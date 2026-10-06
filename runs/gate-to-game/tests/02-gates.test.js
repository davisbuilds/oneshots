// Layer 2: every chip, flattened to NAND gates, against its behavioural spec.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/node.js');
const { rng, randBits } = require('./util.js');

const SLOW = new Set(['RAM512', 'RAM4K']);   // covered in 02b-ram.test.js

function harness(name, opts) {
  const spec = G.hdl.CHIPS[name];
  const nl = G.hdl.build(name, opts);
  const sim = G.sim.create(nl);
  const set = spec.inOrder.map(p => [p, G.sim.setter(nl.inputs[p])]);
  const get = spec.outOrder.map(p => [p, G.sim.getter(nl.outputs[p])]);
  const apply = v => { for (const [p, f] of set) f(sim.s, v[p]); };
  const read = () => Object.fromEntries(get.map(([p, f]) => [p, f(sim.s)]));
  return { spec, nl, sim, apply, read };
}

function vectors(spec, r, count) {
  const widths = spec.inOrder.map(p => spec.ins[p]);
  const total = widths.reduce((a, b) => a + b, 0);
  const out = [];
  if (total <= 14) {
    for (let v = 0; v < 2 ** total; v++) {
      const vec = {}; let k = v;
      spec.inOrder.forEach((p, i) => { vec[p] = k & (2 ** widths[i] - 1); k = Math.floor(k / 2 ** widths[i]); });
      out.push(vec);
    }
    return { list: out, exhaustive: true };
  }
  const edge = w => [0, 1, 2 ** w - 1, 2 ** (w - 1), 2 ** (w - 1) - 1];
  for (let i = 0; i < count; i++) {
    const vec = {};
    spec.inOrder.forEach((p, j) => {
      const w = widths[j];
      vec[p] = i < 25 ? edge(w)[(i + j) % 5] : randBits(r, w);
    });
    out.push(vec);
  }
  return { list: out, exhaustive: false };
}

for (const name of Object.keys(G.hdl.CHIPS)) {
  const spec = G.hdl.CHIPS[name];
  if (!spec.test || SLOW.has(name)) continue;
  test(`${name} matches its spec`, () => {
    const h = harness(name);
    const r = rng(name.length * 7919 + 17);
    if (spec.test.comb) {
      const { list } = vectors(spec, r, 3000);
      for (const v of list) {
        h.apply(v); h.sim.settle();
        assert.deepEqual(h.read(), spec.test.comb(v), `${name}(${JSON.stringify(v)})`);
      }
    } else {
      const seq = spec.test.seq;
      h.sim.clearState();
      let st = seq.init();
      const steps = name.startsWith('RAM') ? 4000 : 600;
      for (let i = 0; i < steps; i++) {
        const v = {};
        for (const p of spec.inOrder) {
          const w = spec.ins[p];
          v[p] = p === 'load' || p === 'reset' ? (r() < (p === 'reset' ? 0.08 : 0.4) ? 1 : 0) : randBits(r, w);
        }
        h.apply(v);
        if (seq.clocked === false) {
          h.sim.settle();
          const res = seq.step(st, v); st = res.state;
          assert.deepEqual(h.read(), res.outs, `${name} step ${i}`);
        } else {
          h.sim.lowPhase();
          const res = seq.step(st, v);
          assert.deepEqual(h.read(), res.outs, `${name} step ${i} ${JSON.stringify(v)}`);
          h.sim.risingEdge();
          st = res.state;
        }
      }
    }
  });
}

test('every chip flattens to NAND gates only, and the counts are stable', () => {
  const counts = Object.fromEntries(['Not', 'And', 'Or', 'Xor', 'Mux', 'FullAdder', 'DLatch', 'DFF', 'Bit', 'ALU', 'CPU']
    .map(n => [n, G.hdl.gateCount(n)]));
  assert.deepEqual(
    { Not: counts.Not, And: counts.And, Or: counts.Or, Xor: counts.Xor, Mux: counts.Mux, FullAdder: counts.FullAdder, DLatch: counts.DLatch, DFF: counts.DFF, Bit: counts.Bit },
    { Not: 1, And: 2, Or: 3, Xor: 4, Mux: 4, FullAdder: 9, DLatch: 4, DFF: 9, Bit: 13 });
  const nl = G.hdl.build('CPU');
  // The only primitive is the gate: every leaf of the instance tree is a Nand.
  for (const inst of nl.insts) {
    if (!inst.children.length) assert.equal(inst.type, 'Nand', `leaf ${inst.type}`);
    if (inst.type === 'Nand') assert.equal(inst.children.length, 0);
  }
  assert.equal(nl.insts.filter(i => i.type === 'Nand').length, nl.nGates);
  console.log('gate counts:', counts);
});

test('a combinational loop is refused', () => {
  G.hdl.defChip('LoopTest', {
    ins: { a: 1 }, outs: { out: 1 },
    build: (c, { a }) => { const w = c.wire(); const x = c.nand(a, w); c.bind(w, c.nand(x, x)); return { out: x }; },
  });
  assert.throws(() => G.sim.create(G.hdl.build('LoopTest')), /combinational loop/);
});
