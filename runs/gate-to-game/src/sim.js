// sim.js: a zero-delay, two-phase simulator for NAND netlists.
//
// Gates are put in dependency order once. Two kinds of loop are allowed and
// handled explicitly: the cross-coupled pair inside every latch (evaluated as
// one unit, which settles it exactly), and the master-to-slave wire inside
// every flip-flop (a "cut": its reader sees the value from the previous clock
// phase). Any other loop is a combinational loop, and compiling refuses it.
//
// A clock cycle is two phases. With clk = 0 every gate is evaluated in order:
// the slaves hold the state, the combinational logic settles, and the masters
// capture the next state. With clk = 1 only the flip-flop gates need to run:
// the masters close and the slaves copy them. After each phase the readers of
// cut nets are re-evaluated; if any of them changed, the phase sweeps again,
// so a phase only ends when every gate agrees with its inputs.
'use strict';
(function (G) {
  const COMPILE_LIMIT = 120000;   // above this many gates, interpret instead

  function order(nl) {
    const { nGates, gA, gB, gOut, driver, pairs, cuts } = nl;
    const unitOf = new Int32Array(nGates).fill(-1);
    const units = [];
    for (const [q, qb] of pairs) {
      // Only a genuine cross-coupled pair is evaluated as a unit; if a fault
      // has cut one of its wires, the two gates are simulated separately.
      const Q = gOut[q], QB = gOut[qb];
      if (!(gA[q] === QB || gB[q] === QB) || !(gA[qb] === Q || gB[qb] === Q)) continue;
      unitOf[q] = unitOf[qb] = units.length; units.push([q, qb]);
    }
    for (let g = 0; g < nGates; g++) if (unitOf[g] < 0) { unitOf[g] = units.length; units.push([g]); }
    const n = units.length;
    const indeg = new Int32Array(n), succ = Array.from({ length: n }, () => []);
    const cutReader = new Uint8Array(n);
    for (let u = 0; u < n; u++) {
      for (const g of units[u]) {
        for (const net of [gA[g], gB[g]]) {
          const d = driver[net];
          if (d < 0) continue;                       // rail, clock or input
          if (cuts.has(net)) { cutReader[u] = 1; continue; }
          const v = unitOf[d];
          if (v === u) continue;
          succ[v].push(u); indeg[u]++;
        }
      }
    }
    const out = [];
    const queue = [];
    for (let u = 0; u < n; u++) if (!indeg[u]) queue.push(u);
    for (let qi = 0; qi < queue.length; qi++) {
      const u = queue[qi];
      out.push(u);
      for (const v of succ[u]) if (--indeg[v] === 0) queue.push(v);
    }
    if (out.length < n) {
      const stuck = [];
      for (let u = 0; u < n && stuck.length < 5; u++) if (indeg[u]) stuck.push(path(nl, units[u][0]));
      throw new Error(`combinational loop through ${n - out.length} gates, e.g. ${stuck.join(', ')}`);
    }
    return { units, order: out, cutReader, unitOf, gOut };
  }

  function path(nl, g) {
    const parts = [];
    for (let i = nl.insts[nl.gInst[g]]; i; i = i.parent) parts.unshift(i.label);
    return parts.join('/');
  }

  function unitCode(nl, unit, track) {
    const { gA, gB, gOut } = nl;
    if (unit.length === 1) {
      const g = unit[0];
      const v = `1^(s[${gA[g]}]&s[${gB[g]}])`;
      return track ? `c|=s[${gOut[g]}]^(s[${gOut[g]}]=${v});` : `s[${gOut[g]}]=${v};`;
    }
    const [q, qb] = unit, Q = gOut[q], QB = gOut[qb];
    const S = gA[q] === QB ? gB[q] : gA[q];
    const R = gA[qb] === Q ? gB[qb] : gA[qb];
    const body = `t=1^(s[${S}]&s[${QB}]);u=1^(s[${R}]&t);t=1^(s[${S}]&u);`;
    return track ? body + `c|=(s[${Q}]^t)|(s[${QB}]^u);s[${Q}]=t;s[${QB}]=u;`
      : body + `s[${Q}]=t;s[${QB}]=u;`;
  }

  // V8 will not optimise one enormous function (a 4,000-statement sweep ran
  // 25 times slower than the same code in chunks), so emit chunks.
  const CHUNK = 500;
  function compileUnits(nl, list, track) {
    const fns = [];
    for (let i = 0; i < list.length; i += CHUNK) {
      const lines = ['let t=0,u=0,c=0;'];
      for (const unit of list.slice(i, i + CHUNK)) lines.push(unitCode(nl, unit, track));
      lines.push('return c;');
      fns.push(new Function('s', lines.join('\n')));
    }
    if (fns.length === 1) return fns[0];
    return s => { let c = 0; for (let i = 0; i < fns.length; i++) c |= fns[i](s); return c; };
  }

  // Interpreted fallback for very large netlists (the big RAMs in the tests).
  function interpUnits(nl, list) {
    const { gA, gB, gOut } = nl;
    const prog = new Int32Array(list.length * 4);
    list.forEach((unit, i) => {
      if (unit.length === 1) { const g = unit[0]; prog.set([-1, gOut[g], gA[g], gB[g]], i * 4); }
      else {
        const [q, qb] = unit, Q = gOut[q], QB = gOut[qb];
        prog.set([Q, QB, gA[q] === QB ? gB[q] : gA[q], gA[qb] === Q ? gB[qb] : gA[qb]], i * 4);
      }
    });
    return function (s) {
      let c = 0;
      for (let i = 0; i < prog.length; i += 4) {
        const k = prog[i];
        if (k < 0) {
          const o = prog[i + 1], v = 1 ^ (s[prog[i + 2]] & s[prog[i + 3]]);
          c |= s[o] ^ v; s[o] = v;
        } else {
          const QB = prog[i + 1], S = prog[i + 2], R = prog[i + 3];
          let t = 1 ^ (s[S] & s[QB]); const u = 1 ^ (s[R] & t); t = 1 ^ (s[S] & u);
          c |= (s[k] ^ t) | (s[QB] ^ u); s[k] = t; s[QB] = u;
        }
      }
      return c;
    };
  }

  function getter(nets) {
    if (!Array.isArray(nets)) nets = [nets];
    return new Function('s', 'return ' + (nets.map((n, i) => i ? `s[${n}]<<${i}` : `s[${n}]`).join('|') || '0') + ';');
  }
  function setter(nets) {
    if (!Array.isArray(nets)) nets = [nets];
    return new Function('s', 'v', nets.map((n, i) => `s[${n}]=v>>>${i}&1;`).join(''));
  }

  function create(nl, opts = {}) {
    const o = order(nl);
    const all = o.order.map(u => o.units[u]);
    const edge = all.filter(unit => unit.every(g => nl.dffGates.has(g)));
    const checks = o.order.filter(u => o.cutReader[u]).map(u => o.units[u]);
    const big = nl.nGates > (opts.compileLimit || COMPILE_LIMIT);
    const mk = (list, track) => big ? interpUnits(nl, list) : compileUnits(nl, list, track);
    const sweepAll = mk(all, false), sweepEdge = mk(edge, false), check = mk(checks, true);
    const s = new Uint8Array(nl.nNets);
    s[1] = 1;
    const stats = { sweeps: 0, phases: 0, maxSweeps: 0 };
    function run(sweep) {
      for (let i = 1; i <= 50; i++) {
        sweep(s);
        if (!check(s)) {
          stats.sweeps += i; stats.phases++;
          if (i > stats.maxSweeps) stats.maxSweeps = i;
          return i;
        }
      }
      throw new Error('netlist did not settle in 50 sweeps (oscillation)');
    }
    const sim = {
      nl, s, stats, gates: nl.nGates, mode: big ? 'interpreted' : 'compiled',
      edgeUnits: edge.length,
      settle: () => run(sweepAll),
      settleEdge: () => run(sweepEdge),
      // One clock cycle: low phase (logic settles, masters capture), then the
      // rising edge (slaves take the new state).
      lowPhase() { s[2] = 0; return run(sweepAll); },
      risingEdge() { s[2] = 1; return run(opts.fullEdge ? sweepAll : sweepEdge); },
      getter, setter,
      get: nets => getter(nets)(s),
      set: (nets, v) => setter(nets)(s, v),
      // Scan access, as real chips have for test: write every latch directly.
      // clearState() puts every latch and flip-flop at 0; loadDffs() writes a
      // value into a list of flip-flops, both halves, least significant first.
      clearState() {
        for (const [q, qb] of nl.pairs) { s[nl.gOut[q]] = 0; s[nl.gOut[qb]] = 1; }
        this.settle();
      },
      loadDffs(dffs, v) {
        dffs.forEach((d, i) => {
          const b = (v >>> i) & 1;
          s[d.mq] = s[d.sq] = b; s[d.mqb] = s[d.sqb] = b ^ 1;
        });
      },
      readDffs(dffs) { return dffs.reduce((v, d, i) => v | (s[d.sq] << i), 0); },
    };
    // Settle once so every latch starts in a consistent state.
    sim.settle();
    return sim;
  }

  G.sim = { create, order, getter, setter, path };
})(globalThis.G2G || (globalThis.G2G = {}));
