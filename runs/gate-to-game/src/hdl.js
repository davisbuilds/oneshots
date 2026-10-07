// hdl.js: a hardware description layer whose only primitive is the NAND gate.
//
// A chip is a function that wires up smaller chips. Building a top-level chip
// flattens everything down to a list of two-input NAND gates, while keeping the
// instance tree (CPU > ALU > Add16 > FullAdder > Nand) so the zoom view can
// walk down it. The two power rails are net 0 (GND, logic 0) and net 1 (VDD,
// logic 1); net 2 is the clock. Every other net is either a top-level input or
// the output of exactly one NAND gate.
'use strict';
(function (G) {
  const GND = 0, VDD = 1, CLK = 2;
  const CHIPS = Object.create(null);

  // spec = { ins: {name: width}, outs: {name: width}, build(c, ins) -> outs,
  //          test?: { comb(ins) -> outs } | { seq: {init(), step(state, ins)} },
  //          layout?: {...}, about?: string }
  function defChip(name, spec) {
    if (CHIPS[name]) throw new Error(`chip ${name} defined twice`);
    spec.name = name;
    spec.inOrder = Object.keys(spec.ins);
    spec.outOrder = Object.keys(spec.outs);
    CHIPS[name] = spec;
    return spec;
  }

  class Builder {
    constructor(opts = {}) {
      this.flat = !!opts.flat;          // skip per-NAND instance nodes (huge RAMs)
      this.gA = []; this.gB = []; this.gOut = []; this.gInst = [];
      this.nNets = 3;                   // GND, VDD, CLK
      this.netName = ['GND', 'VDD', 'clk'];
      this.alias = [];                  // placeholder k (net -1-k) -> resolved net
      this.pairs = [];                  // cross-coupled gate pairs [gQ, gQb]
      this.cuts = new Set();            // nets read as "previous phase" values
      this.dffs = [];                   // {inst, mq, mqb, sq, sqb}
      this.dffGates = new Set();        // gates inside flip-flops
      this.insts = [];
      this.stack = [];
    }
    get cur() { return this.stack[this.stack.length - 1]; }

    newNet(name) { const n = this.nNets++; this.netName[n] = name; return n; }

    // A forward reference, bound later with bind(): how feedback is written.
    wire() { this.alias.push(null); return -this.alias.length; }
    wires(n) { return Array.from({ length: n }, () => this.wire()); }
    bind(w, net) {
      if (Array.isArray(w)) { w.forEach((x, i) => this.bind(x, net[i])); return; }
      if (w >= 0 || this.alias[-1 - w] !== null) throw new Error('bind: not an unbound wire');
      this.alias[-1 - w] = net;
    }
    resolve(n) {
      let guard = 0;
      while (n < 0) {
        const t = this.alias[-1 - n];
        if (t === null || t === undefined) throw new Error('unbound wire');
        n = t;
        if (++guard > 1e6) throw new Error('wire alias loop');
      }
      return n;
    }

    node(type, label, ins) {
      const parent = this.cur || null;
      const inst = { id: this.insts.length, type, label, parent, children: [], ins, outs: null, depth: parent ? parent.depth + 1 : 0 };
      this.insts.push(inst);
      if (parent) parent.children.push(inst);
      return inst;
    }

    // The primitive. Returns the output net.
    nand(a, b, label) {
      const g = this.gA.length;
      const out = this.newNet();
      this.gA.push(a); this.gB.push(b); this.gOut.push(out);
      let owner = this.cur;
      if (!this.flat) {
        const inst = this.node('Nand', label || `nand${this.cur ? this.cur.children.length : 0}`, { a, b });
        inst.outs = { out };
        inst.gate = g;
        owner = inst;
      }
      this.gInst.push(owner ? owner.id : -1);
      if (this.inDff) this.dffGates.add(g);
      return out;
    }

    // Two NANDs wired as an SR latch: q = NAND(s, qb), qb = NAND(r, q).
    // The simulator evaluates the pair as one unit.
    latch(s, r) {
      const qbw = this.wire();
      const gq = this.gA.length;
      const q = this.nand(s, qbw, 'q');
      const gqb = this.gA.length;
      const qb = this.nand(r, q, 'qb');
      this.bind(qbw, qb);
      this.pairs.push([gq, gqb]);
      return { q, qb };
    }

    // Mark a net whose readers see the value from the previous clock phase.
    cut(n) { this.cuts.add(n); return n; }

    get zero() { return GND; }
    get one() { return VDD; }
    get clk() { return CLK; }

    use(name, ins, label) {
      const spec = CHIPS[name];
      if (!spec) throw new Error(`unknown chip ${name}`);
      for (const p of spec.inOrder) {
        const w = spec.ins[p], v = ins[p];
        if (v === undefined) throw new Error(`${name}: missing input ${p}`);
        if (w === 1 ? !Number.isInteger(v) : !(Array.isArray(v) && v.length === w))
          throw new Error(`${name}: input ${p} should be ${w} bit${w > 1 ? 's' : ''}`);
      }
      const inst = this.node(name, label || name, Object.fromEntries(spec.inOrder.map(p => [p, ins[p]])));
      this.stack.push(inst);
      const wasDff = this.inDff;
      if (spec.flipflop) this.inDff = true;
      const outs = spec.build(this, inst.ins);
      this.inDff = wasDff;
      this.stack.pop();
      for (const p of spec.outOrder) {
        const w = spec.outs[p], v = outs[p];
        if (w === 1 ? !Number.isInteger(v) : !(Array.isArray(v) && v.length === w))
          throw new Error(`${name}: output ${p} should be ${w} bit${w > 1 ? 's' : ''}`);
      }
      inst.outs = Object.fromEntries(spec.outOrder.map(p => [p, outs[p]]));
      return inst.outs;
    }

    finish(root, inputs) {
      const R = n => this.resolve(n);
      const RA = v => Array.isArray(v) ? v.map(R) : R(v);
      const gA = Int32Array.from(this.gA, R), gB = Int32Array.from(this.gB, R);
      for (const inst of this.insts) {
        for (const k in inst.ins) inst.ins[k] = RA(inst.ins[k]);
        for (const k in inst.outs) inst.outs[k] = RA(inst.outs[k]);
      }
      const cuts = new Set([...this.cuts].map(R));
      const nets = this.nNets;
      const driver = new Int32Array(nets).fill(-1);
      this.gOut.forEach((o, g) => { driver[o] = g; });
      const dffs = this.dffs.map(d => ({ inst: d.inst, mq: R(d.mq), mqb: R(d.mqb), sq: R(d.sq), sqb: R(d.sqb) }));
      return {
        nGates: gA.length, nNets: nets, gA, gB, gOut: Int32Array.from(this.gOut), gInst: Int32Array.from(this.gInst),
        driver, pairs: this.pairs, cuts, dffs, dffGates: this.dffGates,
        insts: this.insts, root, inputs, outputs: root.outs, netName: this.netName,
      };
    }
  }

  // Build a chip as the top of a netlist: its inputs become free input nets.
  function build(name, opts = {}) {
    const spec = CHIPS[name];
    if (!spec) throw new Error(`unknown chip ${name}`);
    const b = new Builder(opts);
    const inputs = {};
    for (const p of spec.inOrder) {
      const w = spec.ins[p];
      inputs[p] = w === 1 ? b.newNet(p) : Array.from({ length: w }, (_, i) => b.newNet(`${p}[${i}]`));
    }
    b.use(name, inputs, opts.label || name);
    const root = b.insts[0];
    return b.finish(root, inputs);
  }

  // Count the NAND gates a chip flattens to, without keeping the netlist.
  function gateCount(name) { return build(name, { flat: true }).nGates; }

  G.hdl = { defChip, build, gateCount, CHIPS, GND, VDD, CLK, Builder };
})(globalThis.G2G || (globalThis.G2G = {}));
