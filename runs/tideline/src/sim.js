// sim.js: the terminal, second by second.
//
// Everything the console shows comes from here: ships and their stability,
// cranes and their cycles, straddle carriers and trucks on their reserved
// paths, the yard, the gate, the berth schedule and the KPIs. The simulation
// is deterministic for a seed and steps in whole seconds; the renderer
// interpolates between steps from the same plans the vehicles follow.
'use strict';
(function (TL) {
  const L = TL.Layout, M = TL.MAPF, S = TL.Stow, CR = TL.Crane;
  const WL = -3.0;                      // water level, m below the quay deck
  const ID = { truck: 1000, leg: 5000, land: 6000 };
  const SC_DWELL = { pickGround: 18, dropGround: 14, pickTruck: 24, dropTruck: 22, handover: 6 };
  const AH_RATE = 800 / 3600;           // anti-heel transfer, t/s
  const ANCHOR = { x: 1400, y: -720, dy: 120 };  // anchorage slot 0, and the spacing south
  const CRANE_GAP = 30;                 // minimum distance between crane centres, m
  const SC_COUNT = 22;

  // ── Small helpers ──────────────────────────────────────────────────────
  function addCargo(v, st, box) {
    const z = v.boxZ(st, st.boxes.length, st.boxes) + 0.45 * box.h;
    st.boxes.push(box);
    const c = v.cargo; c.W += box.w; c.Mx += box.w * st.x; c.My += box.w * st.y; c.Mz += box.w * z;
  }
  function removeCargo(v, st) {
    const box = st.boxes.pop();
    const z = v.boxZ(st, st.boxes.length, st.boxes) + 0.45 * box.h;
    const c = v.cargo; c.W -= box.w; c.Mx -= box.w * st.x; c.My -= box.w * st.y; c.Mz -= box.w * z;
    return box;
  }
  function cargoInit(v) {
    v.cargo = v.cargoSums(v.stacks.map(s => s.boxes));
  }
  function sumsOf(v, extra) {
    const f = v.fixedSums(), c = v.cargo;
    const s = { W: f.W + c.W, Mx: f.Mx + c.Mx, My: f.My + c.My, Mz: f.Mz + c.Mz, FSM: f.FSM };
    if (extra) { s.W += extra.w; s.Mx += extra.w * extra.x; s.My += extra.w * extra.y; s.Mz += extra.w * extra.z; }
    return s;
  }

  // ── The yard ───────────────────────────────────────────────────────────
  class Yard {
    constructor(sim) {
      this.sim = sim;
      this.stacks = [];
      this.byKey = new Map();
      for (const B of L.BLOCKS) for (let i = B.i0; i <= B.i1; i++) for (const j of B.slots) {
        const st = { key: i + ',' + j, i, j, block: B, boxes: [], incoming: 0, outgoing: 0, x: L.cx(i), y: L.cy(j) };
        this.stacks.push(st); this.byKey.set(st.key, st);
      }
      this.capTEU = this.stacks.length * L.SLOT_TIERS * 2;
    }
    teu() { let n = 0; for (const s of this.stacks) n += s.boxes.length; return n * 2; }
    state(st) { return this.sim.scG.S(st.i, st.j, 1); }
    // Pick a stack with room for a box of this kind, near x.
    allocate(kind, x, rng, avoid) {
      let best = null, bestScore = Infinity;
      for (const st of this.stacks) {
        const B = st.block;
        if (kind === 'reefer' ? !B.reefer : B.reefer) continue;
        if (kind === 'import' && B.row !== 1) continue;
        if (kind === 'export' && B.row !== 0) continue;
        if (st.boxes.length + st.incoming >= L.SLOT_TIERS) continue;
        // A stack with a box about to be picked takes nothing new on top.
        if (st.outgoing > 0) continue;
        if (avoid && avoid === st) continue;
        const score = Math.abs(st.x - x) + (st.boxes.length + st.incoming) * 18 + rng() * 40 + Math.abs(st.y - 120) * 0.1;
        if (score < bestScore) { bestScore = score; best = st; }
      }
      return best;
    }
    put(st, box) { st.boxes.push(box); box.loc = { kind: 'yard', key: st.key, idx: st.boxes.length - 1 }; }
    take(st, box) {
      const k = st.boxes.indexOf(box);
      if (k !== st.boxes.length - 1) throw new Error('yard: box is not on top');
      st.boxes.pop();
      return box;
    }
    stackOf(box) { return box.loc && box.loc.kind === 'yard' ? this.byKey.get(box.loc.key) : null; }
  }

  // ── The simulation ─────────────────────────────────────────────────────
  class Sim {
    constructor(opts = {}) {
      this.seed = opts.seed != null ? opts.seed : 1;
      this.rng = TL.rng(this.seed);
      this.t = 0;
      this.scG = L.buildScGraph();
      this.trG = L.buildTruckGraph();
      if (this.scG.problems.length || this.trG.problems.length) throw new Error('layout is not well-formed: ' + this.scG.problems.concat(this.trG.problems).join('; '));
      this.res = new M.Reservations(L.NX * L.NY);
      this.hSC = new M.Heuristics(this.scG, 900);
      this.hTR = new M.Heuristics(this.trG, 120);
      this.trace = opts.trace || false;
      this.log = [];
      this.alerts = [];
      this.yard = new Yard(this);
      this.ground = new Map();          // SC state id of a buffer -> box on the ground there
      this.tasks = [];
      this.taskSeq = 1;
      this.stats = { moves: [], truckTurns: [], rehandles: 0, refusedPlans: 0, holds: 0, plans: 0, planMs: 0, fallbacks: 0 };
      this.truckRate = opts.truckRate != null ? opts.truckRate : 64;     // trucks per hour
      this.speedHint = 1;
      this._setupCalls(opts);
      this._setupCranes();
      this._setupFleet();
      this._setupYard();
      this._warmStart(opts.warm != null ? opts.warm : 0.38);
      this._backfill();
      this.nextTruck = 30;
      this.trucks = [];
      this.truckSeq = 0;
      this.queue = [];
      this.gateLog = [];
    }

    // ── Calls and berths ─────────────────────────────────────────────────
    _setupCalls(opts) {
      const H = 3600;
      const defs = opts.calls || [
        { cls: 'panamax', name: 'Corvane Lantern', line: 'CVN', berth: 0, etb: -4.5 * H, visit: 'ARD-2641', state: 'working', discharge: 0.3 },
        { cls: 'intermediate', name: 'Brindle Aster', line: 'BRW', berth: 1, etb: -1.2 * H, visit: 'ARD-2642', state: 'working', discharge: 0.36 },
        { cls: 'feeder', name: 'Northmere Wren', line: 'NMF', berth: 2, etb: 1.1 * H, visit: 'ARD-2643', state: 'approach', discharge: 0.42 },
        { cls: 'panamax', name: 'Alder Saffron', line: 'ALD', berth: 0, etb: 14 * H, visit: 'ARD-2644', state: 'planned', discharge: 0.3 },
        { cls: 'intermediate', name: 'Corvane Halyard', line: 'CVN', berth: 1, etb: 19 * H, visit: 'ARD-2645', state: 'planned', discharge: 0.34 },
        { cls: 'feeder', name: 'Northmere Kittiwake', line: 'NMF', berth: 2, etb: 26 * H, visit: 'ARD-2646', state: 'planned', discharge: 0.4 },
      ];
      this.calls = defs.map((d, k) => {
        const v = new TL.Vessel(d.cls, d.name, d.line, { visit: d.visit });
        const rng = TL.rng(this.seed * 100 + k + 1);
        S.generateArrival(v, rng, { discharge: d.discharge, gm: d.cls === 'panamax' ? 1.35 : 1.6 });
        cargoInit(v);
        const call = { id: k, vessel: v, berth: d.berth, etb: d.etb, state: d.state, visit: d.visit, line: d.line, cranes: [], exports: [], plan: null, done: { d: 0, l: 0 }, rng };
        call.eta = call.etb - 1800;
        // Exports for this call wait in the yard (or arrive by truck later).
        const nDis = v.stacks.reduce((n, s) => n + s.boxes.filter(b => b.pod === S.PORT).length, 0);
        const nExp = Math.round(nDis * (0.85 + rng() * 0.3));
        for (let i = 0; i < nExp; i++) {
          const deck = rng() < 0.5, f = rng();
          let type = S.pickType(rng, deck, f);
          const box = S.newBox(rng, { type, pod: rng.pick(S.PODS.slice(0, 3)), line: S.pickLine(rng, d.line), w: S.weightFor(rng, rng() < 0.5, f), vessel: d.name });
          box.call = k;
          call.exports.push(box);
        }
        call.plan = S.autoPlan(v, call.exports);
        call.planned = { d: nDis, l: call.plan.count() };
        call.robCount = v.stacks.map(st => st.boxes.filter(b => b.pod !== S.PORT).length);
        this._placeCall(call);
        return call;
      });
    }
    berthOf(call) { return L.BERTHS[call.berth]; }
    _placeCall(call) {
      const v = call.vessel, B = L.BERTHS[call.berth];
      const guess = B.x0 + (B.x1 - B.x0 - v.hull.LOA) / 2 + v.c.aftOver;
      const b0 = v.bays[0].x;
      call.xAP = Math.round((guess + b0 - L.CELL / 2) / L.CELL) * L.CELL + L.CELL / 2 - b0;
      call.yC = -(v.hull.B / 2 + 1.6);
    }
    // Ship pose: drafts, trim and heel from the live condition.
    condition(call) {
      if (!call._cond || call._condT !== this.t) { call._cond = TL.Stability.condition(call.vessel, sumsOf(call.vessel)); call._condT = this.t; }
      return call._cond;
    }
    shipPose(call) {
      const c = this.condition(call), v = call.vessel;
      const p = { xAP: call.xAP, yC: call.yC, Ta: c.Ta, Tf: c.Tf, heel: c.heel, LCF: c.LCF, L: v.hull.L, T: c.T };
      if (call.motion) Object.assign(p, call.motion);
      return p;
    }
    // Ship coordinates (x from AP, y to starboard, z from keel) to world.
    static shipToWorld(p, x, y, z, out) {
      const th = Math.atan((p.Ta - p.Tf) / p.L), ph = (p.heel || 0) * Math.PI / 180;
      const Tm = p.Tf + (p.Ta - p.Tf) * (1 - p.LCF / p.L);
      const dx = x - p.LCF, dz = z - Tm;
      const x1 = dx * Math.cos(th) - dz * Math.sin(th), z1 = dz * Math.cos(th) + dx * Math.sin(th);
      const z2 = z1 * Math.cos(ph) - y * Math.sin(ph), y2 = y * Math.cos(ph) + z1 * Math.sin(ph);
      out = out || {};
      // Under way the ship turns about its pivot and is offset from the berth.
      const yaw = p.yaw || 0, pv = p.pivot || 0;
      const lx = p.LCF + x1 - pv, ly = -y2;
      out.x = p.xAP + pv + (p.dx || 0) + lx * Math.cos(yaw) - ly * Math.sin(yaw);
      out.y = p.yC + (p.dy || 0) + lx * Math.sin(yaw) + ly * Math.cos(yaw);
      out.z = WL + (p.dz || 0) + z2;
      return out;
    }
    // The inverse in plan, ignoring trim and heel: world (x, y) to ship
    // (x from AP, y to starboard).
    static worldToShip(p, x, y) {
      const yaw = p.yaw || 0, pv = p.pivot || 0;
      const ux = x - (p.xAP + pv + (p.dx || 0)), uy = y - (p.yC + (p.dy || 0));
      const lx = ux * Math.cos(yaw) + uy * Math.sin(yaw), ly = -ux * Math.sin(yaw) + uy * Math.cos(yaw);
      return { x: lx + pv, y: -ly };
    }
    // The hull in plan as a rectangle at the waterline (LOA x beam, plus 1 m
    // all round), from the pose the renderer draws; ymax is its most
    // landward point (the quay edge is y = 0).
    hullRect(call) {
      const p = this.shipPose(call), h = call.vessel.hull;
      const a = Sim.shipToWorld(p, h.xAft, 0, p.T, {}), f = Sim.shipToWorld(p, h.xFwd, 0, p.T, {});
      const ys = [[h.xAft, -1], [h.xAft, 1], [h.xFwd, -1], [h.xFwd, 1]].map(([x, s]) => Sim.shipToWorld(p, x, s * h.B / 2, p.T, {}).y);
      return { x: (a.x + f.x) / 2, y: (a.y + f.y) / 2, th: Math.atan2(f.y - a.y, f.x - a.x), hl: h.LOA / 2 + 1, hw: h.B / 2 + 1, ymax: Math.max(...ys) };
    }
    // World position of a box at (stack, index) on a call's ship (box centre).
    boxWorld(call, st, k, out) {
      const v = call.vessel;
      const z = v.boxZ(st, k, st.boxes) + (st.boxes[k] ? st.boxes[k].h : TL.BOX.H) / 2;
      return Sim.shipToWorld(this.shipPose(call), st.x, st.y, z, out);
    }
    stackTopWorld(call, st) {
      const v = call.vessel;
      return Sim.shipToWorld(this.shipPose(call), st.x, st.y, st.base + v.stackHeight(st, st.boxes), {}).z;
    }

    // ── Cranes ───────────────────────────────────────────────────────────
    _setupCranes() {
      const names = ['QC-01', 'QC-02', 'QC-03', 'QC-04', 'QC-05', 'QC-06'];
      const assign = [0, 0, 0, 1, 1, 2];
      this.cranes = names.map((id, k) => ({
        k, id, x: 40 + k * 120, call: null, bays: [], bay: -1, state: 'idle', status: 'Idle',
        y: L.cy(3), z: CR.K.parkZ, box: null, cycle: null, gantry: null, buffers: [],
        inbound: 0, moves: [], hold: null, boom: 0,
      }));
      // Initial positions spread over their ships.
      const byCall = new Map();
      this.cranes.forEach((c, k) => { const ci = assign[k]; if (!byCall.has(ci)) byCall.set(ci, []); byCall.get(ci).push(c); });
      for (const [ci, list] of byCall) {
        const call = this.calls[ci];
        if (call.state === 'working') this.assignCranes(call, list.map(c => c.k), true);
        else { // park near the berth
          const B = L.BERTHS[call.berth];
          list.forEach((c, i) => { c.x = L.cx(Math.round((B.x0 + 40 + i * 45) / L.CELL)); });
        }
      }
      for (const c of this.cranes) this._reserveLegs(c, this.t, Infinity, c.x);
    }
    legCells(x) {
      const set = new Set();
      for (const dx of [-9, 9]) L.grid.rectCells(x + dx, L.RAIL.land, 0, 4.3, 1.8, set);
      return Int32Array.from([...set].filter(c => c >= 0));
    }
    _reserveLegs(c, t0, t1, x) { this.res.add(this.legCells(x), t0, t1, ID.leg + c.k); }

    // Give a call a set of cranes and split its bays between them by work.
    assignCranes(call, ks, instant) {
      const v = call.vessel;
      ks = ks.slice().sort((a, b) => a - b);
      for (const k of ks) { const c = this.cranes[k]; if (c.call && c.call !== call) c.call.cranes = c.call.cranes.filter(q => q !== k); }
      call.cranes = ks;
      // Bays ordered along the quay (west to east = stern to bow).
      const bays = v.bays.map((b, i) => i).sort((a, b) => v.bays[a].x - v.bays[b].x);
      const work = bays.map(i => this.bayWork(call, i));
      const total = work.reduce((a, b) => a + b, 0) || 1;
      let acc = 0, ci = 0;
      const ranges = ks.map(() => []);
      bays.forEach((b, n) => {
        ranges[Math.min(ks.length - 1, ci)].push(b);
        acc += work[n];
        if (acc >= total * (ci + 1) / ks.length && ci < ks.length - 1) ci++;
      });
      ks.forEach((k, n) => {
        const c = this.cranes[k];
        // A crane with export boxes waiting in (or on their way to) its
        // buffers finishes that bay first: the boxes sit on the ground
        // under it, and it cannot leave them behind.
        const locked = c.call === call && (c.inbound > 0 || c.buffers.some(b => !b.discharge));
        c.call = call; c.bays = ranges[n];
        if (!locked) c.bay = -1;
        if (instant) {
          const first = c.bays.find(b => this.bayWork(call, b) > 0);
          const b = first != null ? first : c.bays[0];
          if (b != null) c.x = call.xAP + v.bays[b].x;
        }
      });
      // Keep the minimum gap in instant placement.
      if (instant) for (let n = 1; n < ks.length; n++) {
        const a = this.cranes[ks[n - 1]], b = this.cranes[ks[n]];
        if (b.x - a.x < CRANE_GAP) b.x = a.x + Math.ceil(CRANE_GAP / 13) * 13;
      }
    }
    // Remaining moves in a bay (discharge + load).
    bayWork(call, b) {
      const v = call.vessel;
      let n = 0;
      for (const id of v.bays[b].stacks) {
        const st = v.stacks[id];
        n += st.boxes.filter(x => x.pod === S.PORT).length;
        const loaded = Math.max(0, st.boxes.length - call.robCount[id]) - st.boxes.filter(x => x.pod === S.PORT).length;
        n += Math.max(0, (call.plan.stacks[id] || []).length - Math.max(0, loaded));
      }
      return n;
    }
    // The next thing a crane can do in a bay: discharge from the top of a
    // stack (deck first, then hold), or load the next planned box (hold
    // first, then deck). Returns candidate lists for the current phase.
    bayPhase(call, b) {
      const v = call.vessel, bay = v.bays[b];
      const st = bay.stacks.map(id => v.stacks[id]);
      const isDis = (s) => s.boxes.length && s.boxes[s.boxes.length - 1].pod === S.PORT && !s.boxes[s.boxes.length - 1].busy;
      const hasDis = (s) => s.boxes.some(x => x.pod === S.PORT);
      const loadedOf = (s) => s.boxes.length - call.robCount[s.id];
      const pending = (s) => (call.plan.stacks[s.id] || []).slice(Math.max(0, loadedOf(s)) + (s.inflight || 0));
      const deck = st.filter(s => s.deck), hold = st.filter(s => !s.deck);
      if (deck.some(hasDis)) return { phase: 'deckD', dis: deck.filter(isDis) };
      if (hold.some(hasDis)) return { phase: 'holdD', dis: hold.filter(isDis) };
      const holdL = hold.filter(s => pending(s).length || (s.inflight || 0) > 0);
      if (holdL.length) return { phase: 'holdL', load: hold.filter(s => pending(s).length), pending, waiting: hold.some(s => (s.inflight || 0) > 0) };
      const deckL = deck.filter(s => pending(s).length || (s.inflight || 0) > 0);
      if (deckL.length) return { phase: 'deckL', load: deck.filter(s => pending(s).length), pending, waiting: deck.some(s => (s.inflight || 0) > 0) };
      return { phase: 'done' };
    }

    // Stability verdict for removing or adding a box on a stack now.
    stabilityAfter(call, st, box, adding) {
      const v = call.vessel;
      const k = adding ? st.boxes.length : st.boxes.length - 1;
      const z = v.boxZ(st, k, st.boxes) + 0.45 * box.h;
      const sign = adding ? 1 : -1;
      const s = sumsOf(v, { w: sign * box.w, x: st.x, y: st.y, z });
      // The anti-heel system works during the cycle; allow for what it can
      // move in the next minute toward upright.
      const P = v.tanks.ahP, Sx = v.tanks.ahS, arm = Sx.y - P.y;
      const need = -s.My / arm;
      const m = TL.clamp(need, -Math.min(AH_RATE * 60, Sx.cap * Sx.fill), Math.min(AH_RATE * 60, P.cap * P.fill));
      s.My += m * arm;
      const c = TL.Stability.condition(v, s);
      const a = TL.Stability.assess(c, { depth: L.BERTHS[call.berth].depth });
      return { c, a };
    }

    // ── Straddle carriers ────────────────────────────────────────────────
    _setupFleet() {
      this.scs = [];
      for (let k = 0; k < SC_COUNT; k++) {
        const pocket = k;
        const s = this.scG.pocketStates[pocket];
        const sc = { k, id: 'SC-' + String(k + 1).padStart(2, '0'), pocket, task: null, box: null, steps: [{ kind: 'park', s, from: s, t0: this.t, t1: Infinity, edge: null, leg: 0 }], hist: [], status: 'Parked', moves: 0 };
        this.res.add(this.scG.states[s].fp, this.t, Infinity, k);
        if (this.trace) sc.hist.push(...sc.steps);
        this.scs.push(sc);
      }
    }
    claimedPockets(except) {
      const set = new Set();
      for (const sc of this.scs) if (sc !== except) set.add(sc.pocket);
      return set;
    }
    // Where an SC can start a new plan: the end of its current move, or now.
    replanPoint(sc) {
      const st = sc.steps;
      for (let i = 0; i < st.length; i++) {
        const s = st[i];
        if (s.t1 < this.t) continue;
        if (s.kind === 'move') return { s: s.s, t: s.t1, i };
        if (s.kind === 'dwell') return null;
        return { s: s.s, t: Math.max(this.t, s.t0), i };
      }
      return null;
    }
    // Is the SC free to take a job (parked, or heading home with no task)?
    available(sc) { return !sc.task; }

    // Try to give task to sc. Plans legs pickup -> drop -> pocket.
    _tryAssign(sc, task) {
      const rp = this.replanPoint(sc);
      if (!rp) return false;
      const g = this.scG;
      const fromPocket = g.states[rp.s].priv >= 0 && g.states[rp.s].priv < g.nPockets && rp.s === g.pocketStates[g.states[rp.s].priv];
      // Final pocket: the free one nearest the drop.
      const claimed = this.claimedPockets(sc);
      let fin = -1, best = Infinity;
      for (let p = 0; p < g.nPockets; p++) {
        if (claimed.has(p)) continue;
        const d = this.hSC.to(g.pocketStates[p])[task.dropState];
        if (d < best) { best = d; fin = p; }
      }
      if (fin < 0) return false;
      const allowed = new Set([fin]);
      if (fromPocket) allowed.add(g.states[rp.s].priv);
      if (task.group != null) allowed.add(task.group);
      const legs = [
        { goal: task.pickState, dwell: task.pickDwell, ready: task.ready || 0 },
        { goal: task.dropState, dwell: task.dropDwell, ready: 0 },
        { goal: g.pocketStates[fin], dwell: Infinity },
      ];
      const old = sc.steps;
      this.res.release(sc.k, rp.t);
      const t0 = Date.now ? Date.now() : 0;
      let steps = M.plan(g, this.res, this.hSC, sc.k, rp.s, rp.t, legs, { allowed, ignore: task.ignore });
      this.stats.plans++;
      if (!steps && fromPocket) {
        // Completeness fallback: wait in the pocket until every other plan
        // has finished, then go (always possible in a well-formed layout).
        const T = Math.max(rp.t, this.res.horizon(sc.k) + 1);
        steps = M.plan(g, this.res, this.hSC, sc.k, rp.s, T, legs, { allowed, ignore: task.ignore, maxExp: 200000 });
        if (steps) { steps.unshift({ kind: 'wait', s: rp.s, from: rp.s, t0: rp.t, t1: T, edge: null, leg: 0 }); this.stats.fallbacks++; }
      }
      this.stats.planMs += (Date.now ? Date.now() : 0) - t0;
      if (!steps) {
        // Keep the old plan: put its reservations back.
        for (const s of old) if (s.t1 >= rp.t) this.res.add(s.kind === 'move' ? s.edge.sweep : g.states[s.s].fp, Math.max(s.t0, rp.t), s.t1, sc.k);
        return false;
      }
      M.reserve(g, this.res, sc.k, steps);
      // Keep the executed prefix of the old plan for the record.
      const prefix = old.slice(0, rp.i).concat(old[rp.i].kind === 'move' ? [old[rp.i]] : (old[rp.i].t0 < rp.t ? [Object.assign({}, old[rp.i], { t1: rp.t })] : []));
      if (this.trace) { sc.hist = sc.hist.filter(s => s.t0 < rp.t).map(s => (s.t1 > rp.t && s.kind !== 'move' ? Object.assign({}, s, { t1: rp.t }) : s)); sc.hist.push(...steps); }
      sc.steps = prefix.concat(steps);
      sc.task = task; sc.pocket = fin;
      task.sc = sc; task.state = 'assigned';
      // Event times from the plan.
      const pick = steps.find(s => s.kind === 'dwell' && s.leg === 0), drop = steps.find(s => s.kind === 'dwell' && s.leg === 1);
      task.pickT0 = pick.t0; task.pickT1 = pick.t1; task.dropT0 = drop.t0; task.dropT1 = drop.t1;
      task.attachT = pick.t1 - 6; task.detachT = drop.t0 + 6;
      task.assignT = this.t;
      if (this.trace) (this.taskLog = this.taskLog || []).push(task);
      sc.status = 'To ' + task.pickLabel;
      return true;
    }

    newTask(o) {
      const t = Object.assign({ id: this.taskSeq++, created: this.t, state: 'open', prio: 1, sc: null, ignore: null, group: null }, o);
      this.tasks.push(t);
      return t;
    }
    _dispatch() {
      const open = this.tasks.filter(t => t.state === 'open' && !(t.after && t.after.some(a => a.state !== 'done')) && (t.ready == null || t.ready - this.t < 240));
      if (!open.length) return;
      open.sort((a, b) => b.prio - a.prio || a.created - b.created);
      const free = this.scs.filter(sc => this.available(sc));
      let budget = 6;
      for (const task of open) {
        if (!free.length || budget <= 0) break;
        // Nearest free SCs first.
        const cand = free.map(sc => {
          const rp = this.replanPoint(sc);
          return { sc, d: rp ? this.hSC.to(task.pickState)[rp.s] + (rp.t - this.t) : Infinity };
        }).filter(c => isFinite(c.d)).sort((a, b) => a.d - b.d).slice(0, 3);
        for (const c of cand) {
          budget--;
          if (this._tryAssign(c.sc, task)) { free.splice(free.indexOf(c.sc), 1); break; }
        }
      }
    }
    // Advance SC events (attach / detach boxes, finish tasks).
    _scEvents() {
      for (const sc of this.scs) {
        const task = sc.task;
        if (!task) continue;
        if (task.state === 'assigned' && this.t >= task.attachT) {
          this._pickUp(task);
          sc.box = task.box; task.state = 'carrying';
          sc.status = 'To ' + task.dropLabel;
        }
        if (task.state === 'carrying' && this.t >= task.detachT) {
          sc.box = null;
          this._putDown(task);
          task.state = 'dropping';
        }
        if (task.state === 'dropping' && this.t >= task.dropT1) {
          task.state = 'done'; task.doneT = this.t;
          sc.task = null; sc.moves++;
          sc.status = 'Returning';
          if (task.onDone) task.onDone(task);
        }
        if (!sc.task) {
          const last = sc.steps[sc.steps.length - 1];
          if (last.kind === 'park' && this.t >= last.t0) sc.status = 'Parked';
        }
      }
    }
    _pickUp(task) {
      const box = task.box;
      if (task.from.kind === 'yard') { this.yard.take(task.from.stack, box); task.from.stack.outgoing--; }
      else if (task.from.kind === 'ground') this.ground.delete(task.from.state);
      else if (task.from.kind === 'truck') task.from.truck.box = null;
      box.loc = { kind: 'sc', sc: task.sc.k };
    }
    _putDown(task) {
      const box = task.box;
      if (task.to.kind === 'yard') { task.to.stack.incoming--; this.yard.put(task.to.stack, box); }
      else if (task.to.kind === 'ground') { this.ground.set(task.to.state, box); box.loc = { kind: 'ground', state: task.to.state, crane: task.to.crane }; }
      else if (task.to.kind === 'truck') { task.to.truck.box = box; box.loc = { kind: 'truck', truck: task.to.truck.id }; }
    }

    // ── Yard and buffer helpers ──────────────────────────────────────────
    _setupYard() {
      const rng = TL.rng(this.seed * 7 + 3);
      // Exports for every call that has not sailed wait in the quay-side blocks.
      for (const call of this.calls) {
        const x = call.xAP + call.vessel.hull.L / 2;
        for (const box of call.exports) {
          const st = this.yard.allocate(box.reefer ? 'reefer' : 'export', x, rng);
          if (!st) throw new Error('yard full');
          this.yard.put(st, box);
        }
      }
      // Imports from earlier calls, waiting for trucks.
      const n = Math.round(this.yard.stacks.length * 0.42);
      for (let i = 0; i < n; i++) {
        const deck = rng() < 0.5, f = rng();
        const box = S.newBox(rng, { type: S.pickType(rng, deck, f), pod: S.PORT, line: S.pickLine(rng, rng.pick(['CVN', 'BRW', 'NMF', 'ALD'])), w: S.weightFor(rng, false, f) });
        box.imported = true;
        const st = this.yard.allocate(box.reefer ? 'reefer' : 'import', rng() * 800, rng);
        if (!st) break;
        this.yard.put(st, box);
      }
    }
    // Free buffer positions under a crane right now.
    craneBuffers(c) {
      const i = Math.round(c.x / L.CELL - 0.5);
      return L.J.buffers.map(j => this.scG.S(i, j, 0)).filter(s => s >= 0);
    }
    bufferFree(c, s) {
      if (this.ground.has(s)) return false;
      if (c.buffers.some(b => b.s === s)) return false;
      return true;
    }

    // ── Crane control ────────────────────────────────────────────────────
    _cranes() {
      for (const c of this.cranes) {
        if (c.pendingSet) this._applyPending(c);
        // Finish a gantry move.
        if (c.state === 'gantry') {
          c.x = CR.evalGantry(c.gantry, this.t);
          if (this.t >= c.gantry.end) { c.x = c.gantry.x1; c.state = 'idle'; c.gantry = null; }
          continue;
        }
        if (c.state === 'cycle') { this._cycleEvents(c); continue; }
        // Idle: find work.
        if (!c.call || c.call.state !== 'working') { c.status = c.call ? 'Waiting for vessel' : 'Idle'; this._parkSpreader(c); continue; }
        this._craneDecide(c);
      }
    }
    _parkSpreader(c) { c.z = Math.max(c.z, CR.K.parkZ); }
    _craneDecide(c) {
      const call = c.call, v = call.vessel;
      // Current bay, or the next one in range with work.
      if (c.bay >= 0 && c.bay >= v.bays.length) c.bay = -1;
      let ph = c.bay >= 0 ? this.bayPhase(call, c.bay) : { phase: 'done' };
      if (ph.phase === 'done' && c.inbound === 0 && !c.buffers.length) {
        const cand = c.bays.filter(b => this.bayPhase(call, b).phase !== 'done');
        if (!cand.length) { c.status = 'Finished'; c.bay = -1; this._parkSpreader(c); return; }
        cand.sort((a, b) => Math.abs(call.xAP + v.bays[a].x - c.x) - Math.abs(call.xAP + v.bays[b].x - c.x));
        // The nearest bay it can reach; if another crane is in the way of
        // all of them, wait for clearance.
        let b = null, blockers = [];
        for (const bb of cand) {
          const x = call.xAP + v.bays[bb].x;
          if (Math.abs(x - c.x) <= 0.5) { b = bb; break; }
          if (this._startGantry(c, x)) { c.bay = bb; c.clearSince = null; return; }
          if (c.blockedBy) blockers.push([bb, c.blockedBy]);
        }
        if (b == null) {
          c.status = 'Waiting for clearance';
          if (c.clearSince == null) c.clearSince = this.t;
          // Ten minutes kept out by a crane on the same ship: there is no
          // room for both, so hand it the bays on its side, where it stands.
          const o = blockers.length && blockers[0][1];
          if (o && o.call === call && !o.pendingSet && this.t - c.clearSince > 600) this._handOver(c, o, blockers.filter(q => q[1] === o).map(q => q[0]));
          return;
        }
        c.clearSince = null;
        c.bay = b; ph = this.bayPhase(call, b);
      }
      if (ph.phase === 'done') { c.status = c.inbound ? 'Waiting for box' : 'Idle'; return; }
      // Prefetch loads for the bay.
      // While boxes still have to come off this bay, one buffer stays free
      // for them: prefetching into both would leave the crane nowhere to
      // put the last discharge (a deadlock the first long run exposed).
      if (ph.phase === 'holdL' || ph.phase === 'deckL') this._requestLoads(c, ph, 0);
      else if (ph.phase === 'holdD' && ph.dis.length <= 2) this._requestLoads(c, this.bayPhaseLoad(call, c.bay), 1);
      if (ph.dis && ph.dis.length) {
        // Discharge: the stack whose top box leaves the ship most upright.
        const bufs = this.craneBuffers(c).filter(s => this.bufferFree(c, s));
        if (!bufs.length) { c.status = 'Waiting for SC'; return; }
        let best = null;
        for (const st of ph.dis) {
          const box = st.boxes[st.boxes.length - 1];
          const r = this.stabilityAfter(call, st, box, false);
          const score = Math.abs(r.c.heel) + (r.a.state === 'out' ? 100 : 0) + Math.abs(st.y) * 0.01;
          if (!best || score < best.score) best = { st, box, r, score };
        }
        if (best.r.a.state === 'out') return this._hold(c, best.r.a.out[0]);
        c.hold = null;
        return this._startCycle(c, 'discharge', best.st, best.box, bufs[0]);
      }
      if (ph.load) {
        // Load: a box waiting under the crane whose stack is ready for it.
        const ready = c.buffers.filter(b => b.arrived && this.ground.get(b.s) === b.box);
        let best = null;
        for (const b of ready) {
          const st = call.vessel.stacks[b.stack];
          const nextIdx = st.boxes.length - call.robCount[st.id];
          if (call.plan.stacks[st.id][nextIdx] !== b.box) continue;
          const r = this.stabilityAfter(call, st, b.box, true);
          const score = Math.abs(r.c.heel) + (r.a.state === 'out' ? 100 : 0);
          if (!best || score < best.score) best = { st, b, r, score };
        }
        if (!best) { c.status = c.inbound ? 'Waiting for box' : 'Idle'; this._parkSpreader(c); return; }
        if (best.r.a.state === 'out') return this._hold(c, best.r.a.out[0]);
        c.hold = null;
        return this._startCycle(c, 'load', best.st, best.b.box, best.b.s, best.b);
      }
      c.status = 'Waiting for box';
    }
    bayPhaseLoad(call, b) {
      // Loads that will follow the hold discharge (for prefetching).
      const v = call.vessel;
      const hold = v.bays[b].stacks.map(id => v.stacks[id]).filter(s => !s.deck);
      const loadedOf = (s) => s.boxes.length - call.robCount[s.id];
      const pending = (s) => (call.plan.stacks[s.id] || []).slice(Math.max(0, loadedOf(s)) + (s.inflight || 0));
      return { phase: 'holdL', load: hold.filter(s => pending(s).length && !s.boxes.some(x => x.pod === S.PORT)), pending };
    }
    _hold(c, reason) {
      if (!c.hold) {
        c.hold = { reason, t: this.t };
        this.stats.holds++;
        this._alert('hold', `${c.id} stability hold on ${c.call.vessel.name}: ${reason}`, c);
      }
      c.status = 'Stability hold';
    }
    _alert(kind, text, ref) {
      const a = { t: this.t, kind, text, ref };
      this.alerts.push(a);
      if (this.alerts.length > 60) this.alerts.shift();
      this.log.push(a);
    }
    // Request export boxes from the yard to this crane's free buffers.
    _requestLoads(c, ph, keepFree) {
      if (!ph.load || !ph.load.length || c.pendingSet) return;
      const call = c.call;
      const bufs = this.craneBuffers(c).filter(s => this.bufferFree(c, s));
      while (bufs.length > keepFree && c.inbound < 2) {
        // Lowest tier first; balance across the centreline.
        let best = null;
        const My = call.vessel.cargo.My;
        for (const st of ph.load) {
          const list = ph.pending(st);
          if (!list.length) continue;
          const tierNow = st.boxes.length + (st.inflight || 0);
          const score = tierNow * 10 + (Math.sign(st.y) === Math.sign(My) ? 3 : 0) + Math.abs(st.y) * 0.05;
          if (!best || score < best.score) best = { st, box: list[0], score };
        }
        if (!best) return;
        const box = this._substitute(call, best.st, best.box);
        if (!box) return;
        const s = bufs.shift();
        best.st.inflight = (best.st.inflight || 0) + 1;
        const buf = { s, box, stack: best.st.id, arrived: false };
        c.buffers.push(buf);
        c.inbound++;
        const ys = this.yard.stackOf(box);
        const task = this._yardPickTask(box, ys, { kind: 'ground', state: s, crane: c.k }, 3, 'load', c.id);
        task.onDone = () => { buf.arrived = true; c.inbound--; };
      }
    }
    // Category-based stowage: any export of the same call, type, port of
    // discharge and weight (within 2.5 t) may take a planned slot, so the
    // carrier fetches whichever such box sits on top of a stack.
    _substitute(call, st, box) {
      const accessible = (b) => { const ys = this.yard.stackOf(b); return ys && ys.incoming === 0 && ys.boxes[ys.boxes.length - 1] === b && !b.reserved; };
      if (accessible(box)) { box.reserved = true; this.yard.stackOf(box).outgoing++; return box; }
      const plan = call.plan;
      let best = null, bd = Infinity;
      for (const b of call.exports) {
        if (b === box || b.type !== box.type || b.pod !== box.pod || Math.abs(b.w - box.w) > 2.5 || !accessible(b)) continue;
        const where = plan.where(b);
        if (where) {
          // Swap only with a box that is not yet on its way.
          const ost = call.vessel.stacks[where.stack];
          const loaded = ost.boxes.length - call.robCount[ost.id] + (ost.inflight || 0);
          if (where.idx < loaded) continue;
        }
        const ys = this.yard.stackOf(b);
        const d = Math.abs(ys.x - (call.xAP + st.x));
        if (d < bd) { bd = d; best = b; }
      }
      if (best) {
        const wb = plan.where(best), wa = plan.where(box);
        if (wb) plan.stacks[wb.stack][wb.idx] = box;
        plan.stacks[wa.stack][wa.idx] = best;
        best.reserved = true;
        this.yard.stackOf(best).outgoing++;
        return best;
      }
      // Dig it out: move the boxes above it elsewhere in the same block.
      const ys = this.yard.stackOf(box);
      if (!ys || ys.incoming > 0 || box.reserved) return null;
      const k = ys.boxes.indexOf(box);
      const above = ys.boxes.slice(k + 1);
      // Each box has at most one pending move: if anything above is already
      // spoken for, try again later.
      if (above.some(b => b.reserved || b.claimed)) return null;
      box.reserved = true;
      ys.outgoing++;
      for (let n = above.length - 1; n >= 0; n--) this._rehandle(above[n], ys);
      return box;
    }
    _rehandle(box, from) {
      const dest = this.yard.allocate(box.reefer ? 'reefer' : (from.block.row === 0 ? 'export' : 'import'), from.x, this.rng, from);
      if (!dest) return;
      dest.incoming++;
      box.reserved = true;
      from.outgoing++;
      this.stats.rehandles++;
      // Boxes come off a stack top first: each rehandle waits for the one above.
      const after = (from.pendingAfter || []).filter(x => x.state !== 'done');
      const t = this.newTask({
        kind: 'rehandle', box, prio: 4, from: { kind: 'yard', stack: from }, to: { kind: 'yard', stack: dest }, after,
        pickState: this.yard.state(from), dropState: this.yard.state(dest), pickDwell: SC_DWELL.pickGround, dropDwell: SC_DWELL.dropGround,
        pickLabel: 'block ' + from.block.name, dropLabel: 'block ' + dest.block.name,
      });
      t.onDone = () => { box.reserved = false; };
      // Anything waiting for this stack must come after.
      (from.pendingAfter = from.pendingAfter || []).push(t);
      return t;
    }
    _yardPickTask(box, ys, to, prio, kind, label) {
      const after = (ys.pendingAfter || []).filter(t => t.state !== 'done');
      const t = this.newTask({
        kind, box, prio, from: { kind: 'yard', stack: ys }, to, after,
        pickState: this.yard.state(ys), dropState: to.kind === 'ground' ? to.state : to.kind === 'truck' ? this.scG.bayStates[to.bay] : this.yard.state(to.stack),
        pickDwell: SC_DWELL.pickGround, dropDwell: to.kind === 'truck' ? SC_DWELL.dropTruck : SC_DWELL.dropGround,
        pickLabel: 'block ' + ys.block.name, dropLabel: label,
      });
      if (to.kind === 'truck') { t.group = this.scG.nPockets + to.bay; t.ignore = ID.truck + to.truck.k; }
      return t;
    }

    // Crane c gives bays it cannot reach to its neighbour o on the same ship.
    _handOver(c, o, bays) {
      const call = c.call, v = call.vessel;
      c.bays = c.bays.filter(b => !bays.includes(b));
      o.bays = o.bays.concat(bays).sort((a, b) => v.bays[a].x - v.bays[b].x);
      c.clearSince = null;
      this.planVersion = (this.planVersion || 0) + 1;
      this._alert('crane', `${c.id} hands bay${bays.length > 1 ? 's' : ''} ${bays.map(b => String(v.bays[b].no).padStart(2, '0')).join(', ')} to ${o.id}: no room for both cranes`, c);
    }
    _startGantry(c, x, depth = 0) {
      // Keep clear of neighbours (their position and where they are going).
      // An idle neighbour in the way is asked to move along first.
      c.blockedBy = null;
      for (const o of this.cranes) {
        if (o === c) continue;
        const ox = o.gantry ? o.gantry.x1 : o.x;
        const lo = Math.min(c.x, x), hi = Math.max(c.x, x);
        const blocks = (o.k < c.k && ox > x - CRANE_GAP) || (o.k > c.k && ox < x + CRANE_GAP) ||
          (ox > lo - CRANE_GAP && ox < hi + CRANE_GAP && Math.sign(ox - c.x) === Math.sign(x - c.x));
        if (!blocks) continue;
        const idle = o.state === 'idle' && (!o.call || o.call.state !== 'working' || o.status === 'Finished') && !o.inbound && !o.buffers.length;
        if (idle && depth < 6) {
          const nx = o.k < c.k ? Math.min(ox, x - CRANE_GAP - 6) : Math.max(ox, x + CRANE_GAP + 6);
          if (nx > 20 && nx < 800) this._startGantry(o, nx, depth + 1);
        }
        c.blockedBy = o;
        return false;
      }
      // Reserve the rail cells the legs sweep, at the earliest free window.
      const sweep = new Set();
      for (let xx = Math.min(c.x, x); xx <= Math.max(c.x, x) + 0.01; xx += 1.5) for (const cell of this.legCells(xx)) sweep.add(cell);
      for (const cell of this.legCells(x)) sweep.add(cell);
      const cells = Int32Array.from(sweep);
      const g = CR.gantry(c.x, x, 0);
      const dur = Math.ceil(g.end) + 1;
      const F = M.freeIntervals(cells, this.res, ID.leg + c.k, -1, this.t);
      let t0 = -1;
      for (let i = 0; i < F.length; i += 2) {
        const a = Math.max(F[i], this.t), b = F[i + 1];
        if (b === Infinity && a + dur <= b) { t0 = a; break; }
      }
      if (t0 < 0 || t0 - this.t > 600) return false;
      this.res.release(ID.leg + c.k, t0);
      this.res.add(cells, t0, t0 + dur, ID.leg + c.k);
      this._reserveLegs(c, t0 + dur, Infinity, x);
      c.gantry = CR.gantry(c.x, x, t0);
      c.gantry.end = t0 + dur;
      if (this.trace) (c.gHist = c.gHist || []).push(c.gantry);
      c.state = 'gantry'; c.status = 'Gantry';
      return true;
    }

    // Plan a full crane cycle, reserve the buffer for the spreader's visit,
    // and hand the box to the straddle carriers.
    _startCycle(c, kind, st, box, bufState, buf) {
      const call = c.call, v = call.vessel;
      const yBuf = this.scG.states[bufState].y;
      const k = kind === 'discharge' ? st.boxes.length - 1 : st.boxes.length;
      const boxW = this.boxWorld(call, st, Math.min(k, st.boxes.length - 1 < 0 ? 0 : k), {});
      // Over-the-bay clearance: the tallest stack in this bay, and the rail.
      let zTop = 8;
      for (const id of v.bays[st.bay].stacks) zTop = Math.max(zTop, this.stackTopWorld(call, v.stacks[id]));
      const sTop = kind === 'discharge'
        ? Sim.shipToWorld(this.shipPose(call), st.x, st.y, st.base + v.stackHeight(st, st.boxes), {})
        : Sim.shipToWorld(this.shipPose(call), st.x, st.y, st.base + v.stackHeight(st, st.boxes), {});
      const h = box.h;
      const t = this.t;
      // Over the apron the spreader (and any box under it) stays above the
      // straddle carriers, 15.3 m tall, with 1.5 m to spare.
      zTop = Math.max(zTop, 16.8);
      let m1, m2, tLock, tUnlock;
      if (kind === 'discharge') {
        m1 = CR.move(c.y, c.z, sTop.y, sTop.z, zTop, false, t);
        tLock = m1.end;
        m2 = CR.move(sTop.y, sTop.z, yBuf, h, zTop + h, true, tLock + CR.K.lock);
      } else {
        m1 = CR.move(c.y, c.z, yBuf, h, Math.max(zTop, 16), false, t);
        tLock = m1.end;
        m2 = CR.move(yBuf, h, sTop.y, sTop.z + h, zTop + h, true, tLock + CR.K.lock);
      }
      // The spreader's visit to the buffer must not meet a passing carrier.
      const visitT = kind === 'discharge' ? m2.end : m1.end;
      const cells = this.scG.states[bufState].fp;
      const F = M.freeIntervals(cells, this.res, ID.land + c.k, -1, t);
      // The spreader is below carrier height for about 12 s before it touches
      // down and, with the lock and the climb back out, 20 s after.
      const a0 = Math.floor(visitT) - 16, a1 = Math.ceil(visitT) + 24;
      let shift = 0;
      for (let i = 0; i < F.length; i += 2) {
        const fa = F[i], fb = F[i + 1];
        const s0 = Math.max(fa, a0);
        if (s0 + (a1 - a0) <= fb) { shift = s0 - a0; break; }
      }
      if (shift > 0) {
        if (kind === 'discharge') { m2.tDn += shift; m2.end += shift; }
        else { m1.tDn += shift; m1.end += shift; tLock = m1.end; m2.tUp += shift; m2.tTr += shift; m2.tDn += shift; m2.end += shift; }
      }
      this.res.add(cells, a0 + shift, a1 + shift, ID.land + c.k);
      tUnlock = m2.end;
      // After letting go, the empty spreader climbs back clear of everything.
      const m3 = CR.move(m2.y1, m2.z1, m2.y1, Math.max(CR.K.parkZ, zTop + CR.K.clearance), 0, false, tUnlock + CR.K.unlock);
      const cyc = { kind, st, box, bufState, buf, m1, m2, m3, tLock, tLift: tLock + CR.K.lock, tUnlock, end: m3.end, stage: 0, call };
      c.cycle = cyc; c.state = 'cycle';
      if (this.trace) (c.cycHist = c.cycHist || []).push({ t0: this.t, m1, m2, m3, tLock, end: cyc.end, box, bufState, kind });
      c.status = kind === 'discharge' ? 'Discharging' : 'Loading';
      box.busy = true;
      if (kind === 'discharge') {
        // The box will land at tUnlock; a carrier can take it right after.
        const dest = this.yard.allocate(box.reefer ? 'reefer' : 'import', c.x, this.rng);
        dest.incoming++;
        c.buffers.push({ s: bufState, box, discharge: true });
        const task = this.newTask({
          kind: 'disch', box, prio: 3, from: { kind: 'ground', state: bufState, crane: c.k }, to: { kind: 'yard', stack: dest },
          pickState: bufState, dropState: this.yard.state(dest), pickDwell: SC_DWELL.handover + 8, dropDwell: SC_DWELL.dropGround,
          ready: Math.ceil(tUnlock + CR.K.unlock) - 8, ignore: ID.land + c.k,
          pickLabel: c.id, dropLabel: 'block ' + dest.block.name,
        });
        cyc.task = task;
      } else {
        st.inflight = Math.max(0, (st.inflight || 0) - 1);
      }
    }
    _cycleEvents(c) {
      const cyc = c.cycle, t = this.t, call = cyc.call, v = call.vessel;
      // Spreader position for display.
      const p = CR.evalCycle(cyc, t);
      c.y = p.y; c.z = p.z;
      if (cyc.stage === 0 && t >= cyc.tLift) {
        cyc.stage = 1;
        if (cyc.kind === 'discharge') {
          removeCargo(v, cyc.st);
          cyc.box.loc = { kind: 'crane', crane: c.k };
          c.box = cyc.box;
        } else {
          this.ground.delete(cyc.bufState);
          c.buffers = c.buffers.filter(b => b !== cyc.buf);
          cyc.box.loc = { kind: 'crane', crane: c.k };
          c.box = cyc.box;
        }
      }
      if (cyc.stage === 1 && t >= cyc.tUnlock) {
        cyc.stage = 2;
        c.box = null;
        if (cyc.kind === 'discharge') {
          this.ground.set(cyc.bufState, cyc.box);
          cyc.box.loc = { kind: 'ground', state: cyc.bufState, crane: c.k };
          c.buffers = c.buffers.filter(b => b.box !== cyc.box);
          call.done.d++;
          cyc.box.imported = true; cyc.box.importT = t; cyc.box.vessel = v.name;
        } else {
          addCargo(v, cyc.st, cyc.box);
          cyc.box.loc = { kind: 'ship', vessel: v.name, stack: cyc.st.id, idx: cyc.st.boxes.length - 1 };
          cyc.box.loaded = true;
          call.done.l++;
          // Export no longer in the yard list for substitution.
        }
        cyc.box.busy = false;
        c.moves.push(t);
        this.stats.moves.push({ t, crane: c.k, call: call.id });
        this._checkInvariant(call);
      }
      if (t >= cyc.end) { c.cycle = null; c.state = 'idle'; c.y = cyc.m3.y1; c.z = cyc.m3.z1; }
    }
    // The live condition must stay inside operating limits after every move.
    _checkInvariant(call) {
      const c = this.condition(call);
      const a = TL.Stability.assess(c, { depth: L.BERTHS[call.berth].depth });
      if (a.state === 'out') {
        this.stats.violations = (this.stats.violations || 0) + 1;
        this._alert('violation', `${call.vessel.name}: ${a.out.join('; ')}`, call);
      }
    }

    // Anti-heeling pumps: move water toward upright, at a limited rate. The
    // ballast pumps also hold trim: when it drifts more than 1.2 m from 0.5 m
    // by the stern, water moves between the peak tanks at 300 t/h.
    _antiHeel() {
      for (const call of this.calls) {
        if (call.state !== 'working') continue;
        {
          const v = call.vessel, c = this.condition(call), A = v.tanks.apk, Fk = v.tanks.fpk;
          const err = c.trim - 0.5;
          if (!call.trimRun && Math.abs(err) > 1.2) call.trimRun = true;
          if (call.trimRun) {
            if (Math.abs(err) < 0.3) call.trimRun = false;
            else {
              const rate = 300 / 3600, dir = err > 0 ? 1 : -1;     // + : move aft water forward
              const m = Math.min(rate, dir > 0 ? A.cap * A.fill : Fk.cap * Fk.fill, dir > 0 ? Fk.cap * (1 - Fk.fill) : A.cap * (1 - A.fill));
              if (m > 1e-3) { A.fill -= dir * m / A.cap; Fk.fill += dir * m / Fk.cap; call._condT = -1; }
              else call.trimRun = false;
            }
          }
        }
        const v = call.vessel, P = v.tanks.ahP, Sx = v.tanks.ahS, arm = Sx.y - P.y;
        const s = sumsOf(v);
        // Like a real anti-heeling system, it starts at a set list (0.35 deg)
        // and stops near upright, so the ship rocks a little as boxes land.
        const c = this.condition(call);
        if (!call.ahRun && Math.abs(c.heel) < 0.35) continue;
        call.ahRun = Math.abs(c.heel) > 0.04;
        const need = -s.My / arm;
        if (Math.abs(need) < 0.05) { call.ahRun = false; continue; }
        const m = TL.clamp(need, -Math.min(AH_RATE, Sx.cap * Sx.fill), Math.min(AH_RATE, P.cap * P.fill));
        P.fill -= m / P.cap; Sx.fill += m / Sx.cap;
      }
    }

    // ── Trucks ───────────────────────────────────────────────────────────
    _trucks() {
      // Arrivals: a Poisson process at the current rate.
      if (this.t >= this.nextTruck) {
        const rate = this.truckRate / 3600;
        this.nextTruck = this.t + Math.max(4, Math.round(-Math.log(1 - this.rng()) / rate));
        this._spawnTruck();
      }
      // Admit queued trucks when a bay is free.
      if (this.queue.length) {
        const busy = new Set(this.trucks.filter(tr => tr.bay != null && tr.state !== 'gone').map(tr => tr.bay));
        const freeBays = L.BAYS.map((b, i) => i).filter(i => !busy.has(i));
        let tries = 2;
        while (this.queue.length && freeBays.length && tries-- > 0) {
          const tr = this.queue[0];
          // The bay nearest the yard stack it deals with.
          const x = tr.stack ? tr.stack.x : 700;
          freeBays.sort((a, b) => Math.abs(L.BAYS[a].x - x) - Math.abs(L.BAYS[b].x - x));
          const bay = freeBays[0];
          if (this._truckIn(tr, bay)) { this.queue.shift(); freeBays.shift(); } else break;
        }
      }
      for (const tr of this.trucks) {
        if (tr.state === 'inbound' && this.t >= tr.dockT) {
          tr.state = 'docked'; tr.status = 'Waiting for SC';
          this._truckTask(tr);
        }
        if (tr.state === 'docked' && tr.retryT != null && this.t >= tr.retryT) this._truckTask(tr);
        if (tr.state === 'served' && !tr.exitPlanned) this._truckOut(tr);
        if (tr.state === 'outbound' && this.t >= tr.goneT) {
          tr.state = 'gone';
          this.res.release(ID.truck + tr.k, this.t);
          this.stats.truckTurns.push({ t: this.t, turn: this.t - tr.gateInT });
        }
      }
      if (this.t % 60 === 0) {
        const keep = (tr) => tr.state !== 'gone' || this.t - tr.goneT < 120;
        if (this.trace) (this._goneTrucks = this._goneTrucks || []).push(...this.trucks.filter(tr => !keep(tr)));
        this.trucks = this.trucks.filter(keep);
      }
    }
    _spawnTruck() {
      const rng = this.rng;
      const k = this.truckSeq++;
      const tr = { k, id: 'TR-' + String(4100 + ((k * 37) % 900)).padStart(4, '0'), state: 'queued', box: null, steps: null, hist: [], queuedT: this.t, status: 'In queue' };
      // Import pickup if there is an import waiting, otherwise an export drop.
      if (rng() < 0.55) {
        const cand = [];
        for (const st of this.yard.stacks) {
          if (st.block.row !== 1) continue;
          const top = st.boxes[st.boxes.length - 1];
          if (top && top.imported && !top.reserved && !top.claimed && st.incoming === 0) cand.push(top);
          if (cand.length > 60) break;
        }
        if (cand.length) {
          const box = rng.pick(cand);
          box.claimed = true;
          tr.kind = 'pickup'; tr.target = box; tr.stack = this.yard.stackOf(box);
          tr.stack.outgoing++;
        }
      }
      if (!tr.kind) {
        // An export for a later call.
        const later = this.calls.filter(c => c.state === 'planned');
        const call = later.length ? rng.pick(later) : this.calls[this.calls.length - 1];
        const deck = rng() < 0.5, f = rng();
        const box = S.newBox(rng, { type: S.pickType(rng, deck, f), pod: rng.pick(S.PODS.slice(0, 3)), line: S.pickLine(rng, call.line), w: S.weightFor(rng, rng() < 0.5, f), vessel: call.vessel.name });
        box.call = call.id; box.late = true;
        tr.kind = 'delivery'; tr.box = box; box.loc = { kind: 'truck', truck: tr.id };
      }
      this.trucks.push(tr);
      this.queue.push(tr);
    }
    _truckIn(tr, bay) {
      const g = this.trG;
      const legs = [
        { goal: g.boothIn[this.rng() < 0.5 ? 0 : 1], dwell: 70 + Math.round(this.rng() * 70) },
        { goal: g.dock[bay], dwell: Infinity },
      ];
      // Try both gate lanes.
      let steps = null;
      for (const booth of [g.boothIn[0], g.boothIn[1]].sort(() => this.rng() - 0.5)) {
        legs[0].goal = booth;
        steps = M.plan(g, this.res, this.hTR, ID.truck + tr.k, g.outside, this.t, legs, { allowed: new Set([bay]) });
        if (steps) break;
      }
      this.stats.plans++;
      if (!steps) return false;
      M.reserve(g, this.res, ID.truck + tr.k, steps);
      tr.steps = steps; tr.bay = bay; tr.state = 'inbound'; tr.status = 'Inbound';
      if (this.trace) tr.hist.push(...steps);
      const enter = steps.find(s => s.kind === 'move');
      tr.gateInT = enter ? enter.t0 : this.t;
      tr.dockT = steps[steps.length - 1].t0;
      return true;
    }
    _truckTask(tr) {
      const bayState = this.scG.bayStates[tr.bay];
      if (tr.kind === 'delivery') {
        const call = this.calls[tr.box.call];
        const dest = this.yard.allocate(tr.box.reefer ? 'reefer' : 'export', call.xAP + call.vessel.hull.L / 2, this.rng);
        dest.incoming++;
        const task = this.newTask({
          kind: 'truckIn', box: tr.box, prio: 1, from: { kind: 'truck', truck: tr }, to: { kind: 'yard', stack: dest },
          pickState: bayState, dropState: this.yard.state(dest), pickDwell: SC_DWELL.pickTruck, dropDwell: SC_DWELL.dropGround,
          group: this.scG.nPockets + tr.bay, ignore: ID.truck + tr.k, pickLabel: L.BAYS[tr.bay].id, dropLabel: 'block ' + dest.block.name,
        });
        // The carrier's pick clears tr.box, so keep the box itself.
        const box = tr.box;
        task.onDone = () => { tr.state = 'served'; call.exports.push(box); };
        task.onPick = () => {};
      } else {
        const box = tr.target;
        const ys = this.yard.stackOf(box);
        const k = ys.boxes.indexOf(box);
        // Dig out if buried, once nothing above has another move pending.
        if (ys.boxes.slice(k + 1).some(b => b.reserved || b.claimed) || ys.incoming > 0) { tr.retryT = this.t + 15; return; }
        tr.retryT = null;
        box.reserved = true;
        for (let n = ys.boxes.length - 1; n > k; n--) this._rehandle(ys.boxes[n], ys);
        const task = this._yardPickTask(box, ys, { kind: 'truck', truck: tr, bay: tr.bay }, 1, 'truckOut', L.BAYS[tr.bay].id);
        task.onDone = () => { tr.state = 'served'; };
      }
    }
    _truckOut(tr) {
      const g = this.trG;
      // Wait until the carrier has left the bay; plan from the dock.
      const legs = [{ goal: g.boothOut[0], dwell: 45 }, { goal: g.sink, dwell: Infinity }];
      this.res.release(ID.truck + tr.k, this.t);
      let steps = null;
      for (const booth of g.boothOut) {
        legs[0].goal = booth;
        steps = M.plan(g, this.res, this.hTR, ID.truck + tr.k, g.dock[tr.bay], this.t, legs, { allowed: new Set([tr.bay]) });
        if (steps) break;
      }
      this.stats.plans++;
      if (!steps) {
        // Stay docked; try again next second.
        this.res.add(g.states[g.dock[tr.bay]].fp, this.t, Infinity, ID.truck + tr.k);
        return;
      }
      M.reserve(g, this.res, ID.truck + tr.k, steps);
      if (this.trace) { tr.hist = tr.hist.filter(s => s.t0 < this.t).map(s => (s.t1 > this.t ? Object.assign({}, s, { t1: this.t }) : s)); tr.hist.push(...steps); }
      tr.steps = tr.steps.filter(s => s.t0 < this.t).map(s => (s.t1 > this.t ? Object.assign({}, s, { t1: this.t }) : s)).concat(steps);
      tr.exitPlanned = true; tr.state = 'outbound'; tr.status = 'Outbound';
      tr.goneT = steps[steps.length - 1].t0;
      tr.bay = null;
    }

    // ── Calls over time ──────────────────────────────────────────────────
    // One ship moves in the harbour at a time: a ship ready to sail waits
    // alongside, and one due in waits at anchor, while another is under way
    // (their paths off the berths cross).
    _basinFree() { return !this.calls.some(o => o.state === 'approach' || o.state === 'departing'); }
    // The lowest anchorage slot not taken by a ship at anchor or by one that
    // has only just left it.
    _freeSlot() {
      const used = new Set(this.calls.filter(o => o.state === 'anchored' || (o.state === 'approach' && this.t < o.etb - 1800)).map(o => o._slot || 0));
      let k = 0;
      while (used.has(k)) k++;
      return k;
    }
    _calls() {
      for (const call of this.calls) {
        if (call.state === 'approach' && this.t >= call.etb) {
          call.state = 'working'; call.motion = null;
          this._alert('berth', `${call.vessel.name} all fast at ${L.BERTHS[call.berth].id}`, call);
          const ks = this.cranes.filter(c => (!c.call || c.call.state !== 'working' || c.status === 'Finished') && this._cranesNear(c, call)).map(c => c.k);
          if (ks.length) this.assignCranes(call, ks.slice(0, call.vessel.cls === 'panamax' ? 3 : call.vessel.cls === 'intermediate' ? 2 : 1));
        }
        if (call.state === 'working' && call.done.d >= call.planned.d && call.done.l >= this._plannedLoads(call)) {
          const busy = this.cranes.some(c => c.call === call && (c.state === 'cycle' || c.inbound));
          if (!busy && this._basinFree()) {
            call.state = 'departing'; call.departT = this.t;
            for (const c of this.cranes) if (c.call === call) { c.call = null; c.status = 'Idle'; c.bays = []; c.bay = -1; }
            call.cranes = [];
            this._alert('sail', `${call.vessel.name} completed: ${call.done.d} off, ${call.done.l} on`, call);
          }
        }
        if (call.state === 'departing' && this.t - call.departT > 1800) call.state = 'gone';
        if (call.state === 'planned' && this.t >= call.etb - 3600) {
          // Berth and harbour free? Then approach; otherwise wait at anchor.
          const occupied = this.calls.some(o => o !== call && o.berth === call.berth && (o.state === 'working' || o.state === 'approach' || o.state === 'departing'));
          // Either way it comes from a free slot at the anchorage.
          call._slot = this._freeSlot();
          if (!occupied && this._basinFree()) { call.state = 'approach'; call.etb = Math.max(call.etb, this.t + 3600); }
          else call.state = 'anchored';
        }
        // At anchor until the berth and the harbour are free, and not before
        // its own berthing time (a re-plan may have pushed it back); of the
        // ships waiting for one berth, the one due first goes first.
        if (call.state === 'anchored' && this.t >= call.etb - 3600) {
          const occupied = this.calls.some(o => o !== call && o.berth === call.berth && (o.state === 'working' || o.state === 'approach' || o.state === 'departing'));
          const first = this.calls.filter(o => o.state === 'anchored' && o.berth === call.berth && this.t >= o.etb - 3600).sort((a, b) => a.etb - b.etb || a._slot - b._slot)[0];
          if (!occupied && first === call && this._basinFree()) { call.state = 'approach'; call.etb = this.t + 3600; }
        }
        // Ship motion for approach / departure (drawn; berthing is exact).
        call.motion = this._shipMotion(call);
      }
    }
    _plannedLoads(call) { return call.plan.count(); }
    _cranesNear(c, call) {
      const B = L.BERTHS[call.berth];
      return c.x > B.x0 - 60 && c.x < B.x1 + 60;
    }
    // Ship motion, drawn, while a ship comes alongside or leaves. Ships lie
    // port side to, bow east; the harbour opens to the south-east. Coming in,
    // a ship sails bow first from the anchorage to a point off its berth,
    // swings there with the tugs and is pushed alongside; leaving, it is
    // pulled off, then sails out east and away. Offsets are from the berthed
    // position; the ship turns about its midlength. tools/check.js tests
    // every pose against the quay, the breakwater and the other ships.
    _shipMotion(call) {
      const h = call.vessel.hull, pivot = (h.xAft + h.xFwd) / 2;
      const R = Math.hypot(h.LOA / 2, h.B / 2);
      const bez = (a, k, b, s) => {
        const q = 1 - s;
        return { x: q * q * a.x + 2 * s * q * k.x + s * s * b.x, y: q * q * a.y + 2 * s * q * k.y + s * s * b.y,
          yaw: Math.atan2(q * (k.y - a.y) + s * (b.y - k.y), q * (k.x - a.x) + s * (b.x - k.x)) };
      };
      const cubic = (a, k, l, b, s) => {
        const q = 1 - s, w = [q * q * q, 3 * s * q * q, 3 * s * s * q, s * s * s];
        const d = [-3 * q * q, 3 * q * q - 6 * s * q, 6 * s * q - 3 * s * s, 3 * s * s];
        const P = [a, k, l, b], f = (c, ww) => P.reduce((n, p, i) => n + ww[i] * p[c], 0);
        return { x: f('x', w), y: f('y', w), yaw: Math.atan2(f('y', d), f('x', d)) };
      };
      const seg = (u, a, b) => TL.clamp((u - a) / (b - a), 0, 1);
      if (call.state === 'approach' || call.state === 'anchored') {
        const u = call.state === 'approach' ? TL.clamp(1 - (call.etb - this.t) / 3600, 0, 1) : 0;
        // Swing off the berth, far enough out to clear the ships alongside.
        const off = R + 45;
        // The anchorage: one column of fixed slots out to the south-east,
        // ships heading west. A ship weighs anchor by sailing west out of
        // the column, clear of the ships north of it, then curves in.
        const S = { x: ANCHOR.x - (call.xAP + pivot), y: ANCHOR.y - ANCHOR.dy * (call._slot || 0) - call.yC };
        const P1 = { x: S.x - 450, y: S.y }, P2 = { x: 300, y: -off }, W = { x: 0, y: -off };
        let m;
        if (call.state === 'anchored') m = { x: S.x, y: S.y, yaw: Math.PI };
        else if (u < 0.5) m = cubic(S, P1, P2, W, TL.easeInOut(seg(u, 0, 0.5)) * 0.5 + seg(u, 0, 0.5) * 0.5);
        else if (u < 0.75) m = { x: 0, y: -off, yaw: Math.PI * (1 - TL.smooth(seg(u, 0.5, 0.75))) };
        else m = { x: 0, y: -off * (1 - TL.smooth(seg(u, 0.75, 1))), yaw: 0 };
        return { dx: m.x, dy: m.y, yaw: m.yaw, pivot };
      }
      if (call.state === 'departing' || call.state === 'gone') {
        const u = TL.clamp((this.t - call.departT) / 1800, 0, 1);
        // Out past the ships alongside at the other berths.
        const off = h.B / 2 + 50;
        let m;
        if (u < 0.3) m = { x: 0, y: -off * TL.smooth(seg(u, 0, 0.3)), yaw: 0 };
        else m = bez({ x: 0, y: -off }, { x: 350, y: -off }, { x: 1000, y: -off - 450 }, TL.easeInOut(seg(u, 0.3, 1)) * 0.5 + seg(u, 0.3, 1) * 0.5);
        return { dx: m.x, dy: m.y, yaw: m.yaw, pivot, hidden: call.state === 'gone' };
      }
      return null;
    }


    // ── Player actions ───────────────────────────────────────────────────
    // Projected completion of a call (seconds), from the work left and the
    // cranes on it at a realistic gross rate.
    projectETD(call) {
      const left = Math.max(0, call.planned.d - call.done.d) + Math.max(0, call.plan.count() - call.done.l);
      const def = call.vessel.cls === 'panamax' ? 3 : call.vessel.cls === 'intermediate' ? 2 : 1;
      const n = call.state === 'working' ? Math.max(1, call.cranes.length) : def;
      // Blend the last hour's pace with the planning norm (27 per crane-hour).
      const recent = this.stats.moves.filter(m => m.call === call.id && m.t > this.t - 3600).length;
      const rate = call.state === 'working' ? 0.5 * recent + 0.5 * n * 27 : n * 27;
      const start = call.state === 'working' ? this.t : Math.max(call.etb, this.t + (call.state === 'approach' ? 0 : 3600));
      let end = start + left / Math.max(rate, 5) * 3600;
      // Alongside, it can only sail once the ship under way is clear.
      if (call.state === 'working') for (const o of this.calls) {
        if (o.state === 'approach') end = Math.max(end, o.etb);
        if (o.state === 'departing') end = Math.max(end, o.departT + 1800);
      }
      return end + 1800;
    }
    callWindow(call) {
      if (call.state === 'departing' || call.state === 'gone') return { start: call.etb, end: call.departT || call.etb };
      return { start: call.state === 'working' ? Math.min(call.etb, this.t) : call.etb, end: this.projectETD(call) };
    }
    // Can this ship lie at that berth? Length of quay, and water under the
    // keel at the deeper of its arrival and planned departure drafts.
    berthErrs(call, berth) {
      const errs = [], B = L.BERTHS[berth], v = call.vessel;
      if (v.hull.LOA + 20 > B.x1 - B.x0) errs.push(`${v.name} is ${v.hull.LOA.toFixed(0)} m long; ${B.id} has ${(B.x1 - B.x0).toFixed(0)} m of quay`);
      if (!call._drafts || call._draftsV !== this.planVersion) {
        const arr = this.condition(call), dep = S.departureCondition(v, call.plan);
        call._drafts = Math.max(arr.maxDraft, dep.maxDraft); call._draftsV = this.planVersion;
      }
      const draft = call._drafts, need = draft + Math.max(TL.Stability.LIMITS.ukcMin, TL.Stability.LIMITS.ukcFrac * draft);
      if (need > B.depth) errs.push(`draft ${draft.toFixed(1)} m needs ${need.toFixed(1)} m of water; ${B.id} has ${B.depth.toFixed(1)} m`);
      return errs;
    }
    // Move a call that is not yet alongside to another berth and/or time.
    // It never overlaps another call on that berth: it waits for earlier
    // ones, and later ones are pushed back.
    moveCall(call, berth, etb) {
      const errs = [];
      if (!(call.state === 'planned' || call.state === 'anchored')) return { ok: false, errs: [`${call.vessel.name} is already ${call.state === 'approach' ? 'approaching' : 'alongside'}; it cannot be moved`] };
      const B = L.BERTHS[berth], v = call.vessel;
      errs.push(...this.berthErrs(call, berth));
      if (errs.length) return { ok: false, errs };
      etb = Math.max(Math.round(etb / 900) * 900, this.t + 3600);
      // Not before whatever is alongside or approaching that berth leaves.
      for (const o of this.calls) {
        if (o === call || o.berth !== berth) continue;
        if (o.state === 'working' || o.state === 'approach') etb = Math.max(etb, this.projectETD(o) + 1800);
      }
      const old = { berth: call.berth, etb: call.etb };
      call.berth = berth; call.etb = etb; call.eta = etb - 1800;
      if (call.state === 'anchored') call.state = 'planned';
      this._placeCall(call);
      // Push later calls on this berth so nothing overlaps.
      const pushed = [];
      const queue = this.calls.filter(o => o.berth === berth && (o.state === 'planned' || o.state === 'anchored') ).sort((a, b) => a.etb - b.etb);
      let free = -Infinity;
      for (const o of this.calls) if (o.berth === berth && (o.state === 'working' || o.state === 'approach')) free = Math.max(free, this.projectETD(o) + 1800);
      // The moved call too: dropped inside an earlier call's window, it
      // berths when that call has left.
      for (const o of queue) {
        if (o.etb < free) { o.etb = Math.ceil(free / 900) * 900; o.eta = o.etb - 1800; if (o !== call) pushed.push(o.vessel.name); }
        free = Math.max(free, this.projectETD(o) + 1800);
      }
      this.planVersion = (this.planVersion || 0) + 1;
      this._alert('schedule', `${v.name} moved to ${B.id}, berthing ${TL.fmt.hm(call.etb)}` + (pushed.length ? `; pushed back: ${pushed.join(', ')}` : ''), call);
      return { ok: true, pushed, old };
    }
    // Reassign a crane (k) to a call, or release it (call null). Cranes
    // share one rail and cannot pass each other, so each call's cranes must
    // be neighbours on the rail.
    assignCrane(k, call) {
      const c = this.cranes[k];
      const from = c.call;
      // Check against where every crane will be once pending reassignments
      // take effect, so two requests cannot together make cranes pass.
      const eff = (o) => (o.pendingSet ? o.pending : o.call);
      const group = (cl) => this.cranes.filter(o => eff(o) === cl).map(o => o.k);
      if (call === eff(c)) return { ok: true };
      // Other requests were checked assuming this one goes ahead, so it
      // cannot be changed or cancelled once made.
      if (c.pendingSet) return { ok: false, errs: [`${c.id} is still on its way to ${c.pending ? c.pending.vessel.name : 'release'}; wait for it to finish`] };
      if (call && call.state !== 'working') return { ok: false, errs: [`${call.vessel.name} is not alongside yet`] };
      if (from && from.state === 'working') {
        const rest = group(from).filter(q => q !== k);
        if (rest.length && Math.min(...rest) < k && Math.max(...rest) > k) return { ok: false, errs: [`${c.id} works between ${this.cranes[Math.min(...rest)].id} and ${this.cranes[Math.max(...rest)].id}; release a crane at the end of the group instead`] };
      }
      if (call) {
        const set = group(call).concat([k]).sort((a, b) => a - b);
        for (let j = set[0]; j <= set[set.length - 1]; j++) {
          if (!set.includes(j)) {
            const o = this.cranes[j], oc = eff(o);
            return { ok: false, errs: [`${o.id} stands between ${c.id} and ${call.vessel.name} on the rail${oc ? ` (${o.pendingSet ? 'going to' : 'working'} ${oc.vessel.name})` : ''}; cranes cannot pass each other`] };
          }
        }
        // The berth must lie on this crane's side of its neighbours (a crane
        // being reassigned counts as standing at its new ship).
        const B = L.BERTHS[call.berth];
        for (const o of this.cranes) {
          const oc = eff(o);
          if (o === c || set.includes(o.k) || !oc || oc.state !== 'working') continue;
          const ob = L.BERTHS[oc.berth], ox = o.pendingSet ? (ob.x0 + ob.x1) / 2 : o.x;
          if (o.k < k && ox > B.x1 - 20) return { ok: false, errs: [`${o.id} is in the way at ${oc.vessel.name}`] };
          if (o.k > k && ox < B.x0 + 20) return { ok: false, errs: [`${o.id} is in the way at ${oc.vessel.name}`] };
        }
      }
      c.pending = call || null;
      c.pendingSet = true;
      this._alert('crane', call ? `${c.id} reassigned to ${call.vessel.name}` : `${c.id} released`, c);
      this._applyPending(c);
      return { ok: true, waiting: c.pendingSet };
    }
    _applyPending(c) {
      if (!c.pendingSet) return;
      if (c.state === 'cycle' || c.inbound > 0 || c.buffers.some(b => !b.discharge)) return;
      const call = c.pending, from = c.call;
      c.pendingSet = false; c.pending = undefined;
      if (from) { from.cranes = from.cranes.filter(q => q !== c.k); if (from.cranes.length && from.state === 'working') this.assignCranes(from, from.cranes); }
      if (call) this.assignCranes(call, call.cranes.concat([c.k]));
      else { c.call = null; c.bays = []; c.bay = -1; c.status = 'Idle'; }
      this.planVersion = (this.planVersion || 0) + 1;
    }
    // Re-plan a box on the stowage plan (drag and drop).
    replan(call, box, toStack, toIdx) {
      const v = call.vessel, st = v.stacks[toStack];
      if (!st) return { ok: false, errs: ['no such slot'] };
      if (!st.deck) {
        const deckLoaded = v.bays[st.bay].stacks.some(id => v.stacks[id].deck && v.stacks[id].boxes.some(b => b.loaded));
        if (deckLoaded) return { ok: false, errs: [`bay ${String(v.bays[st.bay].no).padStart(2, '0')}: deck loading has started, the hatch is closed`] };
      }
      const fixed = (id) => { let n = 0; for (const b of call.plan.stacks[id] || []) { if (b.loaded || b.reserved) n++; else break; } return n; };
      const r = S.tryMove(v, call.plan, box, toStack, toIdx, { depth: L.BERTHS[call.berth].depth, fixed, locked: (b) => b.loaded || b.reserved || b.busy });
      if (r.ok) {
        this.planVersion = (this.planVersion || 0) + 1;
        this.stats.replans = (this.stats.replans || 0) + 1;
      } else {
        this.stats.refusedPlans++;
      }
      return r;
    }

    // ── Warm start: the first calls are already part-worked ─────────────
    _warmStart(frac) {
      const rng = TL.rng(this.seed * 13 + 5);
      for (const call of this.calls) {
        if (call.state !== 'working') continue;
        // As many moves as its cranes would have made since it berthed (less
        // the first 20 minutes of lines and lashing), at 27 per crane-hour.
        const v = call.vessel;
        const hours = Math.max(0, (-call.etb - 1200) / 3600);
        const target = Math.min(Math.round((call.planned.d + call.planned.l) * 0.9), Math.round(hours * call.cranes.length * 27 * (0.9 + frac * 0)));
        let done = 0;
        // Work bays in each crane's range in order, completing them.
        const ranges = call.cranes.map(k => this.cranes[k].bays.slice());
        let guard = 0;
        while (done < target && guard++ < 5000) {
          let progressed = false;
          for (const r of ranges) {
            while (r.length && this.bayPhase(call, r[0]).phase === 'done') r.shift();
            if (!r.length || done >= target) continue;
            const ph = this.bayPhase(call, r[0]);
            if (ph.dis && ph.dis.length) {
              const st = ph.dis.sort((a, b) => Math.abs(this.stabilityAfter(call, a, a.boxes[a.boxes.length - 1], false).c.heel) - Math.abs(this.stabilityAfter(call, b, b.boxes[b.boxes.length - 1], false).c.heel))[0];
              const box = removeCargo(v, st);
              const dest = this.yard.allocate(box.reefer ? 'reefer' : 'import', call.xAP + st.x, rng);
              box.imported = true; box.importT = -3600; box.vessel = v.name;
              if (dest) this.yard.put(dest, box);
              call.done.d++; done++; progressed = true;
            } else if (ph.load && ph.load.length) {
              const st = ph.load.sort((a, b) => a.boxes.length - b.boxes.length)[0];
              const box = ph.pending(st)[0];
              const ys = this.yard.stackOf(box);
              if (ys) ys.boxes.splice(ys.boxes.indexOf(box), 1);
              // Boxes above it in the yard drop down a tier.
              if (ys) ys.boxes.forEach((b, i) => { b.loc.idx = i; });
              addCargo(v, st, box);
              box.loc = { kind: 'ship', vessel: v.name, stack: st.id, idx: st.boxes.length - 1 };
              box.loaded = true;
              call.done.l++; done++; progressed = true;
            }
            this._levelNow(call);
          }
          if (!progressed) break;
        }
        // Cranes start at the bay they were working.
        for (const k of call.cranes) {
          const c = this.cranes[k];
          const b = c.bays.find(bb => this.bayPhase(call, bb).phase !== 'done');
          if (b != null) { c.x = call.xAP + v.bays[b].x; c.bay = b; }
        }
        for (let n = 1; n < call.cranes.length; n++) {
          const a = this.cranes[call.cranes[n - 1]], b = this.cranes[call.cranes[n]];
          if (b.x - a.x < CRANE_GAP) { b.x = a.x + CRANE_GAP + 9; b.bay = -1; }
        }
      }
      this.res.release(ID.leg + 0, -1); for (const c of this.cranes) { this.res.release(ID.leg + c.k, -1); this._reserveLegs(c, this.t, Infinity, c.x); }
    }
    // The moves done before the console opened, spread over the time each
    // call has been alongside, so the KPIs start with a real history.
    _backfill() {
      const rng = TL.rng(this.seed * 31 + 7);
      for (const call of this.calls) {
        if (call.state !== 'working') continue;
        const n = call.done.d + call.done.l, span = -call.etb - 1200;
        if (n <= 0 || span <= 0) continue;
        for (let i = 0; i < n; i++) {
          const t = Math.round(call.etb + 1200 + span * (i + rng()) / n);
          const k = call.cranes[i % call.cranes.length];
          this.stats.moves.push({ t, crane: k, call: call.id });
          this.cranes[k].moves.push(t);
        }
      }
      this.stats.moves.sort((a, b) => a.t - b.t);
      for (const c of this.cranes) c.moves.sort((a, b) => a - b);
    }
    _levelNow(call) {
      const v = call.vessel, P = v.tanks.ahP, Sx = v.tanks.ahS, arm = Sx.y - P.y;
      const s = sumsOf(v);
      const m = TL.clamp(-s.My / arm, -Sx.cap * Sx.fill, P.cap * P.fill);
      P.fill -= m / P.cap; Sx.fill += m / Sx.cap;
    }

    // A ship alongside with no crane gets the nearest idle one that can
    // reach it without passing another crane.
    _autoCranes() {
      for (const call of this.calls) {
        if (call.state !== 'working' || this.cranes.some(c => (c.pendingSet ? c.pending : c.call) === call)) continue;
        const B = L.BERTHS[call.berth], mid = (B.x0 + B.x1) / 2;
        const idle = this.cranes.filter(c => !c.pendingSet && (!c.call || c.call.state !== 'working')).sort((a, b) => Math.abs(a.x - mid) - Math.abs(b.x - mid));
        for (const c of idle) {
          const r = this.assignCrane(c.k, call);
          if (r.ok) break;
        }
      }
    }

    // ── One second ───────────────────────────────────────────────────────
    step() {
      this.t++;
      if (this.t % 300 === 0) this._autoCranes();
      this._calls();
      this._antiHeel();
      this._cranes();
      this._trucks();
      this._scEvents();
      this._dispatch();
      if (this.t % 300 === 0) this.res.prune(this.t - 5);
    }
    run(seconds) { for (let i = 0; i < seconds; i++) this.step(); }

    // ── KPIs ─────────────────────────────────────────────────────────────
    kpi() {
      const t = this.t, H = 3600;
      const recent = this.stats.moves.filter(m => m.t > t - H);
      const prev = this.stats.moves.filter(m => m.t > t - 2 * H && m.t <= t - H);
      const working = this.cranes.filter(c => c.call && c.call.state === 'working').length || 1;
      // Per crane that was working in each window.
      const nIn = (list) => Math.max(1, new Set(list.map(m => m.crane)).size);
      const mph = recent.length / Math.max(working === 1 ? 1 : 0, nIn(recent));
      const mphPrev = prev.length / nIn(prev);
      // (stats.moves holds the shift's history, including the hours before
      // the console opened; see _backfill.)
      const turns = this.stats.truckTurns.filter(x => x.t > t - H).map(x => x.turn);
      return {
        atBerth: this.calls.filter(c => c.state === 'working').length,
        arriving: this.calls.filter(c => c.state === 'approach').length,
        anchored: this.calls.filter(c => c.state === 'anchored').length,
        berths: L.BERTHS.length,
        mph, mphPrev, cranesWorking: this.cranes.filter(c => c.call && c.call.state === 'working').length,
        yardTEU: this.yard.teu(), yardCap: this.yard.capTEU,
        queue: this.queue.length, inside: this.trucks.filter(tr => tr.state === 'inbound' || tr.state === 'docked' || tr.state === 'served' || tr.state === 'outbound').length,
        turn: turns.length ? turns.reduce((a, b) => a + b, 0) / turns.length : null,
        rehandles: this.stats.rehandles, holds: this.stats.holds,
      };
    }
  }

  TL.Sim = Sim;
  TL.SIM = { WL, ID, SC_DWELL, AH_RATE, CRANE_GAP, SC_COUNT, sumsOf, addCargo, removeCargo };
})(globalThis.TL = globalThis.TL || {});
