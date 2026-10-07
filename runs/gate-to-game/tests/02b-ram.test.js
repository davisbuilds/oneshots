// Layer 2, continued: the big RAMs at gate level. RAM4K is 1,134,523 NAND
// gates, too many to compile to one function, so the simulator interprets it.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/node.js');
const { rng, randBits } = require('./util.js');

function ramTest(name, words, ops, seed) {
  const nl = G.hdl.build(name, { flat: true });
  const sim = G.sim.create(nl);
  const io = nl.inputs;
  const setIn = G.sim.setter(io.in), setAddr = G.sim.setter(io.address), out = G.sim.getter(nl.outputs.out);
  sim.clearState();
  const mem = new Uint16Array(words);
  const r = rng(seed);
  const used = [];
  for (let i = 0; i < ops; i++) {
    // Mostly writes at first, then reads back addresses already written.
    const write = i < ops / 2 ? r() < 0.8 : r() < 0.2;
    const a = !write && used.length && r() < 0.8 ? used[Math.floor(r() * used.length)] : randBits(r, Math.log2(words));
    const v = randBits(r, 16);
    setIn(sim.s, v); setAddr(sim.s, a); sim.s[io.load] = write ? 1 : 0;
    sim.lowPhase();
    assert.equal(out(sim.s), mem[a], `${name} op ${i}: read ${a}`);
    sim.risingEdge();
    if (write) { mem[a] = v; used.push(a); }
  }
  return { gates: nl.nGates, mode: sim.mode };
}

test('RAM512 at gate level stores and returns words', () => {
  const r = ramTest('RAM512', 512, 600, 1);
  assert.equal(r.gates, 141755);
});

test('RAM4K at gate level stores and returns words', () => {
  const r = ramTest('RAM4K', 4096, 300, 2);
  assert.equal(r.gates, 1134523);
  assert.equal(r.mode, 'interpreted');
});

test('the whole computer in NAND gates runs a compiled program like the reference', () => {
  // CPU + RAM4K + address decoding: 1.14 million gates, every one simulated.
  const prog = G.tin.compile(`
    var fib[12]; var sieve[40]; var count = 0;
    func main() {
      fib[0] = 0; fib[1] = 1;
      for (var i = 2; i < 12; i++) fib[i] = fib[i - 1] + fib[i - 2];
      for (var n = 2; n < 40; n++) {
        if (sieve[n] == 0) { count++; for (var m = n + n; m < 40; m += n) sieve[m] = 1; }
      }
    }`);
  const nl = G.hdl.build('Computer', { flat: true });
  const sim = G.sim.create(nl);
  sim.clearState();
  const o = nl.outputs, setInst = G.sim.setter(nl.inputs.inst);
  const pc = G.sim.getter(o.pc), out = G.sim.getter(o.outM), addr = G.sim.getter(o.addressM);
  const ref = new G.machine.Machine(prog.rom, { cpu: 'ref' });
  const halt = prog.program.labels.get('__halt');
  let cycles = 0;
  for (; cycles < 6000; cycles++) {
    const st = ref.state();
    if (st.PC === halt) break;
    assert.equal(pc(sim.s), st.PC, `cycle ${cycles}: pc`);
    setInst(sim.s, prog.rom[st.PC]);
    sim.lowPhase();
    const inM = ref.board.read(st.A);
    const r = G.isa.step(st, prog.rom[st.PC], inM);
    assert.equal(sim.s[o.writeM], r.out.writeM, `cycle ${cycles}: writeM`);
    assert.equal(addr(sim.s), r.out.addressM, `cycle ${cycles}: address`);
    if (r.out.writeM) assert.equal(out(sim.s), r.out.outM, `cycle ${cycles}: data`);
    sim.risingEdge();
    ref.run(1);
  }
  assert.equal(ref.state().PC, halt, `halted after ${cycles} cycles`);
  const g = name => ref.board.ram[prog.globals.find(v => v.name === name).addr];
  assert.equal(g('count'), 12);              // the primes below 40
  console.log(`${nl.nGates} gates, ${cycles} cycles in lockstep`);
});
