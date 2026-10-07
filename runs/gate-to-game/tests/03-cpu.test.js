// Layer 3: the 1,753-gate CPU against the instruction-set reference.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/node.js');
const { rng, randBits } = require('./util.js');

function lockstep(nl, cycles, seed, { stopAtFirst = false, simOpts } = {}) {
  const cpu = new G.machine.GateCPU(nl, simOpts);
  const { sim, f } = cpu, s = sim.s, o = nl.outputs;
  const outM = G.sim.getter(o.outM), addr = G.sim.getter(o.addressM), pc = G.sim.getter(o.pc);
  const r = rng(seed);
  let st = { A: 0, D: 0, PC: 0 };
  for (let i = 0; i < cycles; i++) {
    // Bias towards compute instructions, and towards jumps that do something.
    const inst = r() < 0.25 ? randBits(r, 15) : 0x8000 | randBits(r, 15);
    const inM = randBits(r, 16), reset = r() < 0.01 ? 1 : 0;
    f.inst(s, inst); f.inM(s, inM); s[cpu.resetNet] = reset;
    sim.lowPhase();
    const ref = G.isa.step(st, inst, inM, reset);
    const got = { outM: outM(s), writeM: s[o.writeM], addressM: addr(s), pc: pc(s) };
    if (stopAtFirst) { if (JSON.stringify(got) !== JSON.stringify(ref.out)) return i; }
    else assert.deepEqual(got, ref.out, `cycle ${i}: ${G.asm.disassemble(inst)} with A=${st.A} D=${st.D} PC=${st.PC} inM=${inM}`);
    sim.risingEdge();
    st = ref.next;
  }
  return -1;
}

test('the gate-level CPU matches the ISA for 100,000 random instructions', () => {
  const nl = G.hdl.build('CPU');
  assert.equal(nl.nGates, 1753);
  lockstep(nl, 100000, 2026);
});

test('every phase of the CPU settles in one sweep', () => {
  const cpu = new G.machine.GateCPU();
  const r = rng(9);
  for (let i = 0; i < 2000; i++) {
    cpu.f.inst(cpu.sim.s, randBits(r, 16)); cpu.f.inM(cpu.sim.s, randBits(r, 16));
    assert.equal(cpu.sim.lowPhase(), 1);
    assert.equal(cpu.sim.risingEdge(), 1);
  }
});

test('the scan path rebuilds the exact state of every net in a cycle', () => {
  // Run a real program on the gate CPU and, at sampled cycles, rebuild the
  // cycle from its registers alone. Every one of the 1,789 nets must agree.
  const prog = G.asm.assemble(`
    A = 100
    D = A
  loop:
    A = 7
    M = D
    D = D - 1
    A = 2000
    M = M + D
    A = loop
    D ; jgt
  end:
    A = end
    0 ; jmp`).words;
  const m = new G.machine.Machine(prog);
  const probe = new G.machine.Probe(m.cpu.nl);
  const s = m.cpu.sim.s;
  let checked = 0;
  for (let i = 0; i < 400; i++) {
    const st = m.state();
    const inM = m.board.read(st.A);
    // Run the low phase of the next cycle by hand, compare, then finish it.
    const { f, sim } = m.cpu;
    f.inst(s, prog[st.PC] ?? 0); f.inM(s, inM);
    sim.lowPhase();
    const live = s.slice();
    const rebuilt = probe.snapshot(prog, { ...st, inM });
    assert.deepEqual(rebuilt, live, `cycle ${i}`);
    checked++;
    if (s[m.cpu.writeM]) m.board.write(st.A, f.out(s), i, {}, {});
    sim.risingEdge();
  }
  assert.equal(checked, 400);
});

test('random instructions catch single stuck-at faults in the CPU', () => {
  // Fault injection, as chips are tested in the fab: tie one gate input to
  // GND or VDD and see whether the lockstep test notices. For this test the
  // clock-high phase evaluates every gate, so a fault that breaks the
  // master/slave discipline shows up as the race it would be in silicon.
  // A NOT gate is a NAND with its inputs tied, and NAND(a, 1) = NOT a, so a
  // stuck-at-1 on either of its inputs changes nothing and is not counted.
  const base = G.hdl.build('CPU');
  const r = rng(77);
  let caught = 0, total = 0, redundant = 0;
  for (let k = 0; k < 250; k++) {
    const g = Math.floor(r() * base.nGates), side = r() < 0.5 ? 'gA' : 'gB', rail = r() < 0.5 ? 0 : 1;
    const saved = base[side][g];
    if (saved === rail) continue;
    if (rail === 1 && base.gA[g] === base.gB[g]) { redundant++; continue; }
    base[side][g] = rail;
    total++;
    let hit = -1;
    try { hit = lockstep(base, 6000, k + 1, { stopAtFirst: true, simOpts: { fullEdge: true } }); }
    catch (e) { if (!/settle/.test(e.message)) throw e; hit = 0; }   // an oscillation is a detection
    if (hit >= 0) caught++;
    base[side][g] = saved;
  }
  console.log(`stuck-at faults caught: ${caught}/${total} (${redundant} redundant NOT-input faults skipped)`);
  assert.ok(caught / total >= 0.97, `${caught}/${total}`);
});
