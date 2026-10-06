// machine.js: the G16 computer: a CPU, a ROM, RAM, a screen, keys and a timer.
//
// The CPU runs either as its NAND netlist (`gates`, the default) or as the
// ISA reference (`ref`); the test suite proves the two agree cycle for cycle.
// Memory is outside the CPU, as on a real board. The RAM chips are built from
// NAND too (RAM8 .. RAM4K in chips.js, tested at gate level), but here they
// are simulated by their tested behaviour so the game can run in real time.
//
// Every write to the screen is logged per pixel: the cycle, and the CPU state
// at the start of that cycle and the one before it. From those, the zoom view
// can rebuild every net in the CPU for the cycle that drew any pixel.
'use strict';
(function (G) {
  const { MAP } = G.isa;
  const PIXELS = MAP.WIDTH * MAP.HEIGHT;
  // The video board's sixteen colours.
  const PALETTE = ['#05060a', '#3b4766', '#ff5468', '#d9384f', '#ff9944', '#e07a2a', '#ffd84a', '#e0b52a',
    '#5be38a', '#38c26c', '#47c9ff', '#2aa1dd', '#a98bff', '#8669ec', '#eef2f8', '#fff3a0'];
  const SCREEN_END = MAP.SCREEN + PIXELS;

  class Board {
    constructor() {
      this.ram = new Uint16Array(MAP.RAM_WORDS);
      this.screen = new Uint16Array(PIXELS);
      this.keys = 0;
      this.tick = 0;
      this.log = {
        cycle: new Float64Array(PIXELS).fill(-1),
        // per pixel: pc, A, D, inM at the drawing cycle, then the same for the cycle before
        regs: new Uint16Array(PIXELS * 8),
      };
      this.writes = 0;
      this.dirty = true;
    }
    read(a) {
      if (a < MAP.RAM_WORDS) return this.ram[a];
      if (a >= MAP.SCREEN && a < SCREEN_END) return this.screen[a - MAP.SCREEN];
      if (a === MAP.KEYS) return this.keys;
      if (a === MAP.TICK) return this.tick & 0xFFFF;
      return 0;
    }
    write(a, v, cycle, st, prev) {
      this.writes++;
      if (a < MAP.RAM_WORDS) { this.ram[a] = v; return; }
      if (a >= MAP.SCREEN && a < SCREEN_END) {
        const p = a - MAP.SCREEN;
        this.screen[p] = v;
        this.dirty = true;
        this.log.cycle[p] = cycle;
        const r = this.log.regs, o = p * 8;
        r[o] = st.pc; r[o + 1] = st.A; r[o + 2] = st.D; r[o + 3] = st.inM;
        r[o + 4] = prev.pc; r[o + 5] = prev.A; r[o + 6] = prev.D; r[o + 7] = prev.inM;
      }
    }
    pixelRecord(p) {
      const c = this.log.cycle[p];
      if (c < 0) return null;
      const r = this.log.regs, o = p * 8;
      return {
        pixel: p, x: p % MAP.WIDTH, y: Math.floor(p / MAP.WIDTH), value: this.screen[p], cycle: c,
        now: { PC: r[o], A: r[o + 1], D: r[o + 2], inM: r[o + 3] },
        before: c > 0 ? { PC: r[o + 4], A: r[o + 5], D: r[o + 6], inM: r[o + 7] } : null,
      };
    }
  }

  // Locate the A, D and PC flip-flops in the CPU netlist (bit 0 first).
  function registerDffs(nl) {
    const under = (inst, label) => { for (let i = inst; i; i = i.parent) if (i.parent === nl.root && i.label === label) return true; return false; };
    const pick = label => nl.dffs.filter(d => under(d.inst, label));
    return { A: pick('A'), D: pick('D'), PC: pick('pc') };
  }

  let cpuNetlist = null;
  function netlist() { return cpuNetlist || (cpuNetlist = G.hdl.build('CPU')); }

  class GateCPU {
    constructor(nl = netlist(), simOpts) {
      this.nl = nl;
      this.sim = G.sim.create(nl, simOpts);
      this.sim.clearState();
      const io = nl.inputs, out = nl.outputs;
      this.regs = registerDffs(nl);
      const dNets = nl.root.children.find(c => c.label === 'D').outs.out;
      this.f = {
        pc: G.sim.getter(out.pc), A: G.sim.getter(out.addressM), D: G.sim.getter(dNets),
        out: G.sim.getter(out.outM), inst: G.sim.setter(io.inst), inM: G.sim.setter(io.inM),
      };
      this.writeM = out.writeM;
      this.resetNet = io.reset;
    }
    state() { const s = this.sim.s; return { A: this.f.A(s), D: this.f.D(s), PC: this.f.pc(s) }; }
  }

  class RefCPU {
    constructor() { this.st = { A: 0, D: 0, PC: 0 }; }
    state() { return { ...this.st }; }
  }

  class Machine {
    constructor(rom, opts = {}) {
      this.rom = rom;
      this.board = new Board();
      this.kind = opts.cpu || 'gates';
      this.cpu = this.kind === 'gates' ? new GateCPU(opts.netlist) : new RefCPU();
      this.cycle = 0;
      this.prev = { pc: 0, A: 0, D: 0, inM: 0 };
      this.cur = { pc: 0, A: 0, D: 0, inM: 0 };
      this.reset();
    }

    reset() {
      if (this.kind === 'gates') {
        const { sim, f } = this.cpu, s = sim.s;
        s[this.cpu.resetNet] = 1;
        f.inst(s, 0); f.inM(s, 0);
        sim.lowPhase(); sim.risingEdge();
        s[this.cpu.resetNet] = 0;
      } else this.cpu.st = { A: 0, D: 0, PC: 0 };
      this.cycle = 0;
    }

    run(n) {
      return this.kind === 'gates' ? this.runGates(n) : this.runRef(n);
    }

    runGates(n) {
      const { rom, board } = this;
      const { sim, f } = this.cpu, s = sim.s, wm = this.cpu.writeM;
      let cur = this.cur, prev = this.prev;
      for (let i = 0; i < n; i++) {
        const pc = f.pc(s), A = f.A(s), D = f.D(s);
        f.inst(s, pc < rom.length ? rom[pc] : 0);
        const inM = board.read(A);
        f.inM(s, inM);
        const t = prev; prev = cur; cur = t;
        cur.pc = pc; cur.A = A; cur.D = D; cur.inM = inM;
        sim.lowPhase();
        if (s[wm]) board.write(A, f.out(s), this.cycle, cur, prev);
        sim.risingEdge();
        this.cycle++;
      }
      this.cur = cur; this.prev = prev;
    }

    runRef(n) {
      const { rom, board } = this, st = this.cpu.st;
      let cur = this.cur, prev = this.prev;
      for (let i = 0; i < n; i++) {
        const pc = st.PC, inst = pc < rom.length ? rom[pc] : 0;
        const inM = board.read(st.A);
        const t = prev; prev = cur; cur = t;
        cur.pc = pc; cur.A = st.A; cur.D = st.D; cur.inM = inM;
        const r = G.isa.step(st, inst, inM);
        if (r.out.writeM) board.write(st.A, r.out.outM, this.cycle, cur, prev);
        st.A = r.next.A; st.D = r.next.D; st.PC = r.next.PC;
        this.cycle++;
      }
      this.cur = cur; this.prev = prev;
    }

    state() { return this.cpu.state(); }
  }

  // Rebuild every net of the CPU during one cycle, from that cycle's starting
  // state: load the registers through the scan path, apply the instruction
  // and the RAM word, and let the low phase settle.
  class Probe {
    constructor(nl = netlist()) {
      this.cpu = new GateCPU(nl);
      this.nl = nl;
    }
    snapshot(rom, st) {
      const { sim, f, regs } = this.cpu, s = sim.s;
      sim.clearState();
      sim.loadDffs(regs.A, st.A); sim.loadDffs(regs.D, st.D); sim.loadDffs(regs.PC, st.PC);
      s[this.cpu.resetNet] = 0;
      f.inst(s, st.PC < rom.length ? rom[st.PC] : 0);
      f.inM(s, st.inM);
      sim.lowPhase();
      return s.slice();
    }
  }

  G.machine = { Machine, Board, GateCPU, RefCPU, Probe, netlist, registerDffs, PIXELS, PALETTE };
})(globalThis.G2G || (globalThis.G2G = {}));
