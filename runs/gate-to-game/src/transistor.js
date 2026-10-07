// transistor.js: the layer under the NAND gate, as switch-level CMOS.
//
// A MOSFET is modelled as a switch between two nodes, controlled by its gate:
// an NMOS conducts when its gate is 1, a PMOS when its gate is 0. A node's
// value is 1 if it connects through conducting switches to VDD, 0 if to GND,
// 'X' if to both (a short circuit) and 'Z' if to neither (floating). That is
// enough to check that four transistors make a NAND, and that 1,753 NAND
// cells wired together still compute what the gate-level simulation says.
'use strict';
(function (G) {
  // The CMOS NAND cell: two PMOS in parallel pull the output up, two NMOS in
  // series pull it down. `mid` is the node between the two NMOS.
  const NAND_CELL = [
    { name: 'P1', type: 'p', gate: 'a', src: 'VDD', drn: 'out' },
    { name: 'P2', type: 'p', gate: 'b', src: 'VDD', drn: 'out' },
    { name: 'N1', type: 'n', gate: 'a', src: 'mid', drn: 'out' },
    { name: 'N2', type: 'n', gate: 'b', src: 'GND', drn: 'mid' },
  ];

  const conducts = (t, g) => (t.type === 'n' ? g === 1 : g === 0);

  // Solve a switch network. `ts` is a list of {type, gate, src, drn} over node
  // names; `fixed` gives the driven nodes (VDD, GND and inputs). Transistor
  // gates may be driven by other solved nodes, so iterate to a fixed point.
  function solve(ts, fixed) {
    const val = new Map(Object.entries(fixed));
    for (let iter = 0; iter < 1000; iter++) {
      const parent = new Map();
      const find = x => { while (parent.has(x) && parent.get(x) !== x) x = parent.get(x); return x; };
      const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
      const nodes = new Set();
      for (const t of ts) { nodes.add(t.src); nodes.add(t.drn); }
      for (const n of nodes) if (!parent.has(n)) parent.set(n, n);
      for (const t of ts) if (conducts(t, val.get(t.gate))) union(t.src, t.drn);
      const groups = new Map();
      for (const n of nodes) {
        const r = find(n);
        if (!groups.has(r)) groups.set(r, { hi: false, lo: false, members: [] });
        const g = groups.get(r);
        g.members.push(n);
        if (n in fixed) { if (fixed[n] === 1) g.hi = true; else if (fixed[n] === 0) g.lo = true; }
      }
      let changed = false;
      for (const g of groups.values()) {
        const v = g.hi && g.lo ? 'X' : g.hi ? 1 : g.lo ? 0 : 'Z';
        for (const n of g.members) if (!(n in fixed) && val.get(n) !== v) { val.set(n, v); changed = true; }
      }
      if (!changed) return val;
    }
    throw new Error('switch network did not settle');
  }

  // The four transistors of one NAND, with what each is doing.
  function nandCell(a, b) {
    const v = solve(NAND_CELL, { VDD: 1, GND: 0, a, b });
    const tr = NAND_CELL.map(t => ({ ...t, g: t.gate === 'a' ? a : b, on: conducts(t, t.gate === 'a' ? a : b) }));
    return { out: v.get('out'), mid: v.get('mid'), transistors: tr };
  }

  // Expand a gate netlist into transistors: net n becomes node "n", and each
  // gate adds its own internal node between its NMOS pair.
  function expand(nl) {
    const ts = [];
    for (let g = 0; g < nl.nGates; g++) {
      const a = 'n' + nl.gA[g], b = 'n' + nl.gB[g], out = 'n' + nl.gOut[g], mid = 'm' + g;
      ts.push({ type: 'p', gate: a, src: 'n1', drn: out }, { type: 'p', gate: b, src: 'n1', drn: out },
        { type: 'n', gate: a, src: mid, drn: out }, { type: 'n', gate: b, src: 'n0', drn: mid });
    }
    return ts;
  }

  G.transistor = { NAND_CELL, solve, nandCell, expand, conducts };
})(globalThis.G2G || (globalThis.G2G = {}));
