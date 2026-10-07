// trace.js: from one pixel to the transistor that switched.
//
// A pixel's log entry says which cycle wrote it and what the CPU's registers
// held at the start of that cycle and the one before. The probe rebuilds all
// nets of both cycles; the nets that differ are what flipped. From the CPU
// output that made the write, the trace walks back through gates whose
// output flipped, and picks one: the first in the adder if the flip passed
// through it, otherwise the one deepest in the chip hierarchy. That is the
// single gate the zoom view lands on. In that gate, the transistor that
// switched is the one whose input flipped and which now conducts.
'use strict';
(function (G) {
  const { MAP } = G.isa;

  function funcAt(compiled, pc) {
    const fs = compiled.functions;
    let lo = 0, hi = fs.length - 1, best = null;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (fs[mid].start <= pc) { best = fs[mid]; lo = mid + 1; } else hi = mid - 1; }
    return best && best.name;
  }

  // Who called whom, read from the static return-address slots.
  function callChain(compiled, ram, pc, max = 8) {
    const chain = [];
    let f = funcAt(compiled, pc), at = pc;
    while (f && chain.length < max) {
      chain.push({ name: f, pc: at });
      if (f === 'main') break;
      const slot = compiled.program.symbols.get(`${f}.$ret`);
      if (slot === undefined) break;
      at = ram[slot];
      const g = funcAt(compiled, at - 1);
      if (!g || g === f) break;
      f = g;
    }
    return chain;
  }

  // The gate whose flip the zoom shows, for a write in cycle `now`.
  function pickGate(nl, before, now) {
    const flip = n => before[n] !== now[n];
    const o = nl.outputs;
    let start = -1;
    for (const n of o.outM.slice(0, 4)) if (flip(n) && now[n]) { start = n; break; }
    if (start < 0) for (const n of o.outM) if (flip(n)) { start = n; break; }
    if (start < 0 && flip(o.writeM)) start = o.writeM;
    if (start < 0) return null;
    const chain = [];
    const seen = new Set();
    let n = start;
    while (n > 2 && !seen.has(n)) {
      seen.add(n);
      const g = nl.driver[n];
      if (g < 0) break;
      chain.push(g);
      const a = nl.gA[g], b = nl.gB[g];
      const fa = flip(a) && nl.driver[a] >= 0, fb = flip(b) && nl.driver[b] >= 0;
      if (fa) n = a; else if (fb) n = b; else break;
    }
    // Land in the adder if the flip came through it (the ALU computing the
    // value), otherwise on the deepest gate of the chain.
    const inside = (g, type) => { for (let i = nl.insts[nl.gInst[g]]; i; i = i.parent) if (i.type === type) return true; return false; };
    let best = chain.find(g => inside(g, 'FullAdder'));
    if (best === undefined) {
      let bestDepth = -1;
      for (const g of chain) {
        const d = nl.insts[nl.gInst[g]].depth;
        if (d > bestDepth) { best = g; bestDepth = d; }
      }
    }
    return { gate: best, chain, start };
  }

  // Inside a NAND: which transistor switched on to make this output.
  function pickTransistor(nl, g, before, now) {
    const a = now[nl.gA[g]], b = now[nl.gB[g]], fa = before[nl.gA[g]] !== a, fb = before[nl.gB[g]] !== b;
    const out = 1 ^ (a & b);
    if (out) {
      // Pulled up: a PMOS whose input is 0, preferably the one that just went to 0.
      if (!a && fa) return 'P1';
      if (!b && fb) return 'P2';
      return a ? 'P2' : 'P1';
    }
    if (fb && !fa) return 'N2';
    return 'N1';
  }

  // The cycle in slow motion, with every NAND taking one unit of time. Start
  // from the previous cycle's settled state, let the rising edge hand each
  // master's value to its slave, apply this cycle's instruction and RAM word,
  // then update every gate at once from the values of the step before, until
  // nothing changes. history[t] holds every net after t gate delays. The
  // fast simulator has no notion of time, so this is a check on it too: the
  // last step must equal its settled state exactly.
  function replay(nl, before, now, maxSteps = 600) {
    let s = before.slice();
    for (const d of nl.dffs) { s[d.sq] = before[d.mq]; s[d.sqb] = before[d.mqb]; }
    const io = nl.inputs;
    for (const n of [...io.inst, ...io.inM, io.reset]) s[n] = now[n];
    s[2] = 0;
    const history = [s];
    const { gA, gB, gOut, nGates } = nl;
    const changes = new Uint16Array(nl.nNets);
    for (let t = 0; t < maxSteps; t++) {
      const n = s.slice();
      let moved = false;
      for (let g = 0; g < nGates; g++) {
        const o = gOut[g], v = 1 ^ (s[gA[g]] & s[gB[g]]);
        if (v !== s[o]) { n[o] = v; moved = true; changes[o]++; }
      }
      if (!moved) break;
      history.push(n);
      s = n;
    }
    let glitches = 0;
    for (let k = 3; k < nl.nNets; k++) if (changes[k] > 1) glitches++;
    const last = history[history.length - 1];
    let same = true;
    for (let k = 0; k < nl.nNets; k++) if (last[k] !== now[k]) { same = false; break; }
    return { history, steps: history.length - 1, glitches, settled: same };
  }

  function pathTo(nl, inst) {
    const path = [];
    for (let i = inst; i; i = i.parent) path.unshift(i);
    return path;
  }

  // Everything the zoom needs for one pixel.
  function select(machine, compiled, pixel, probe) {
    const rec = machine.board.pixelRecord(pixel);
    const base = { pixel, x: pixel % MAP.WIDTH, y: Math.floor(pixel / MAP.WIDTH), value: machine.board.screen[pixel], address: MAP.SCREEN + pixel };
    if (!rec) return { ...base, record: null };
    const rom = machine.rom;
    const now = probe.snapshot(rom, rec.now);
    const before = rec.before ? probe.snapshot(rom, rec.before) : now;
    const nl = probe.nl;
    const picked = pickGate(nl, before, now);
    const gate = picked ? picked.gate : nl.driver[nl.outputs.writeM];
    const leaf = nl.insts[nl.gInst[gate]];
    let flips = 0;
    for (let k = 3; k < nl.nNets; k++) if (before[k] !== now[k]) flips++;
    const chainPcs = machine.board.chains ? machine.board.chains.get(pixel) : null;
    return {
      ...base, record: rec, now, before, gate, path: pathTo(nl, leaf), chain: picked ? picked.chain : [gate],
      transistor: pickTransistor(nl, gate, before, now), flips,
      inst: rom[rec.now.PC], pc: rec.now.PC,
      asmLine: compiled.program.asmLine[rec.now.PC], srcLine: compiled.program.srcLine[rec.now.PC],
      func: funcAt(compiled, rec.now.PC), calls: chainPcs || null,
    };
  }

  G.trace = { funcAt, callChain, pickGate, pickTransistor, pathTo, select, replay };
})(globalThis.G2G || (globalThis.G2G = {}));
