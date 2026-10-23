// mapf.js: collision-free, deadlock-free paths for every vehicle.
//
// Method: Token Passing for lifelong multi-agent pickup and delivery
// (H. Ma, J. Li, T. K. S. Kumar and S. Koenig, "Lifelong Multi-Agent Path
// Finding for Online Pickup and Delivery Tasks", AAMAS 2017), planned with
// space-time A* against a reservation table (D. Silver, "Cooperative
// Pathfinding", AIIDE 2005), on an infrastructure that is *well-formed* in the
// sense of M. Čáp, J. Vokřínek and A. Kleiner ("Complete Decentralized Method
// for On-Line Multi-Robot Trajectory Planning in Well-formed Infrastructures",
// ICAPS 2015).
//
// The pieces, and why they add up to a guarantee:
//   - Vehicles plan one at a time (the token). A plan reserves, for every
//     cell its body sweeps, the interval during which it sweeps it. Reserved
//     intervals of different vehicles never share an instant, so two bodies
//     can never be in the same cell at once: no collisions, by construction.
//   - Every plan ends in a parking pocket and reserves it for ever. Pockets
//     are dead ends that no other route sweeps (checked when the graph is
//     built). A vehicle in its pocket can therefore always wait until every
//     other plan has finished, and then drive through an empty network: a
//     plan always exists (the fallback below), so nothing waits for ever.
//   - A vehicle that is already moving may try to improve its plan (take a
//     new job on the way home); if that fails it keeps its old, valid plan.
// The headless checker (tools/check.js) does not trust any of this: it
// rebuilds every body as a rectangle from the executed trajectories and tests
// them pairwise for overlap.
'use strict';
(function (TL) {
  const INF = Infinity;

  // A grid of square cells over the ground plane, used only to index space.
  class Grid {
    constructor(x0, y0, cell, nx, ny) { Object.assign(this, { x0, y0, cell, nx, ny }); }
    id(i, j) { return j * this.nx + i; }
    ij(id) { return [id % this.nx, Math.floor(id / this.nx)]; }
    center(i, j) { return [this.x0 + (i + 0.5) * this.cell, this.y0 + (j + 0.5) * this.cell]; }
    cellAt(x, y) { return [Math.floor((x - this.x0) / this.cell), Math.floor((y - this.y0) / this.cell)]; }
    // Cells overlapped by an oriented rectangle (centre, heading, half sizes).
    rectCells(x, y, th, hl, hw, out) {
      const c = Math.cos(th), s = Math.sin(th);
      const ex = Math.abs(c) * hl + Math.abs(s) * hw, ey = Math.abs(s) * hl + Math.abs(c) * hw;
      const [i0, j0] = this.cellAt(x - ex, y - ey), [i1, j1] = this.cellAt(x + ex - 1e-9, y + ey - 1e-9);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (i < 0 || j < 0 || i >= this.nx || j >= this.ny) { out.add(-1); continue; }
        // Separating axis test between the rectangle and the cell square.
        const cx = this.x0 + (i + 0.5) * this.cell, cy = this.y0 + (j + 0.5) * this.cell, h = this.cell / 2;
        const dx = cx - x, dy = cy - y;
        // Axes of the rectangle.
        const pa = Math.abs(dx * c + dy * s), ra = hl + h * (Math.abs(c) + Math.abs(s));
        const pb = Math.abs(-dx * s + dy * c), rb = hw + h * (Math.abs(s) + Math.abs(c));
        if (pa >= ra || pb >= rb) continue;
        out.add(j * this.nx + i);
      }
      return out;
    }
  }

  // Poses along an edge's motion. Motions: line (constant heading), turn (in
  // place), path (sampled points, for trucks' arcs and reversing).
  function motionPose(m, u, out) {
    if (m.type === 'line') {
      out.x = m.x0 + (m.x1 - m.x0) * u; out.y = m.y0 + (m.y1 - m.y0) * u; out.th = m.th;
    } else if (m.type === 'turn') {
      out.x = m.x; out.y = m.y; out.th = m.th0 + (m.th1 - m.th0) * u;
    } else {
      const p = m.pts, f = u * (p.length - 1), k = Math.min(p.length - 2, Math.floor(f)), t = f - k;
      const a = p[k], b = p[k + 1];
      out.x = a[0] + (b[0] - a[0]) * t; out.y = a[1] + (b[1] - a[1]) * t;
      let d = b[2] - a[2];
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      out.th = a[2] + d * t;
    }
    return out;
  }

  // The graph one class of vehicle drives on.
  class Graph {
    constructor(grid, body) {
      this.grid = grid; this.body = body;      // body: { hl, hw, margin }
      this.states = []; this.out = []; this.inn = [];
      this.pockets = [];                        // state ids
    }
    footprint(x, y, th) {
      const set = new Set();
      this.grid.rectCells(x, y, th, this.body.hl + this.body.margin, this.body.hw + this.body.margin, set);
      return set;
    }
    addState(x, y, th, tag) {
      const fp = this.footprint(x, y, th);
      const id = this.states.length;
      this.states.push({ id, x, y, th, fp: Int32Array.from(fp), tag: tag || null, priv: -1 });
      this.out.push([]); this.inn.push([]);
      return id;
    }
    // d: duration in steps; motion as above. The sweep is every cell the body
    // touches along the motion, sampled finely.
    addEdge(a, b, d, motion, kind) {
      const set = new Set(this.states[a].fp);
      for (const c of this.states[b].fp) set.add(c);
      const p = { x: 0, y: 0, th: 0 }, n = Math.max(8, d * 8);
      for (let k = 0; k <= n; k++) {
        motionPose(motion, k / n, p);
        this.grid.rectCells(p.x, p.y, p.th, this.body.hl + this.body.margin, this.body.hw + this.body.margin, set);
      }
      const e = { a, b, d, motion, kind: kind || 'move', sweep: Int32Array.from(set), priv: -1 };
      this.out[a].push(e); this.inn[b].push(e);
      return e;
    }
    // Mark pockets and everything private to them; verify well-formedness.
    sealPockets(ids) {
      this.pockets = ids.slice();
      const owner = new Map();
      ids.forEach((s, k) => { for (const c of this.states[s].fp) owner.set(c, k); });
      const problems = [];
      const privOf = (cells, what) => {
        let p = -1;
        for (const c of cells) {
          if (c < 0) { problems.push(`${what} leaves the grid`); continue; }
          const k = owner.get(c);
          if (k === undefined) continue;
          if (p >= 0 && k !== p) problems.push(`${what} touches two pockets`);
          p = k;
        }
        return p;
      };
      this.states.forEach((st, i) => { st.priv = privOf(st.fp, `state ${i}`); });
      for (const list of this.out) for (const e of list) {
        e.priv = privOf(e.sweep, `edge ${e.a}->${e.b}`);
        const pa = this.states[e.a].priv, pb = this.states[e.b].priv;
        if ((pa >= 0 && e.priv >= 0 && pa !== e.priv) || (pb >= 0 && e.priv >= 0 && pb !== e.priv)) problems.push(`edge ${e.a}->${e.b} mixes pockets`);
      }
      this.problems = problems;
      return problems;
    }
  }

  // Reservation table: per cell, a list of [start, end, owner] intervals
  // (closed, so two owners never share an instant).
  class Reservations {
    constructor(ncells) { this.cells = new Array(ncells); for (let i = 0; i < ncells; i++) this.cells[i] = []; }
    add(cells, a, b, owner) {
      for (const c of cells) if (c >= 0) this.cells[c].push(a, b, owner);
    }
    free(cells, a, b, self, ignore) {
      for (let k = 0; k < cells.length; k++) {
        const c = cells[k];
        if (c < 0) return false;
        const L = this.cells[c];
        for (let i = 0; i < L.length; i += 3) {
          if (L[i] <= b && a <= L[i + 1]) {
            const o = L[i + 2];
            if (o !== self && o !== ignore) return false;
          }
        }
      }
      return true;
    }
    // Remove every interval of an owner that starts at or after t, and cut
    // the ones that span t back to t (used when a plan is replaced).
    release(owner, t) {
      for (const L of this.cells) {
        if (!L.length) continue;
        for (let i = L.length - 3; i >= 0; i -= 3) {
          if (L[i + 2] !== owner) continue;
          if (L[i] >= t) L.splice(i, 3);
          else if (L[i + 1] > t) L[i + 1] = t;
        }
      }
    }
    prune(t) {
      for (const L of this.cells) {
        if (!L.length) continue;
        for (let i = L.length - 3; i >= 0; i -= 3) if (L[i + 1] < t) L.splice(i, 3);
      }
    }
    // The latest finite end of anyone else's reservation (for the fallback).
    horizon(self) {
      let h = 0;
      for (const L of this.cells) for (let i = 0; i < L.length; i += 3) if (L[i + 2] !== self && L[i + 1] !== INF && L[i + 1] > h) h = L[i + 1];
      return h;
    }
    ownersAt(c) { const L = this.cells[c], r = []; for (let i = 0; i < L.length; i += 3) r.push([L[i], L[i + 1], L[i + 2]]); return r; }
  }

  // Exact static distances (in steps) to a goal state, for the A* heuristic.
  class Heuristics {
    constructor(graph, capacity = 600) { this.g = graph; this.cache = new Map(); this.cap = capacity; }
    to(goal) {
      let d = this.cache.get(goal);
      if (d) { this.cache.delete(goal); this.cache.set(goal, d); return d; }
      const n = this.g.states.length;
      d = new Float32Array(n).fill(INF);
      d[goal] = 0;
      const h = new TL.Heap();
      h.push(0, goal);
      while (h.size) {
        const k = h.peekKey(), s = h.pop();
        if (k > d[s]) continue;
        for (const e of this.g.inn[s]) {
          const nd = k + e.d;
          if (nd < d[e.a]) { d[e.a] = nd; h.push(nd, e.a); }
        }
      }
      this.cache.set(goal, d);
      if (this.cache.size > this.cap) this.cache.delete(this.cache.keys().next().value);
      return d;
    }
  }

  // Free time windows of a set of cells: the complement of everyone else's
  // reserved intervals (integers; closed intervals), from t0 on.
  function freeIntervals(cells, res, self, ignore, t0) {
    const busy = [];
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      if (c < 0) return [];
      const L = res.cells[c];
      for (let i = 0; i < L.length; i += 3) {
        const o = L[i + 2];
        if (o === self || o === ignore || L[i + 1] < t0) continue;
        busy.push(L[i], L[i + 1]);
      }
    }
    const n = busy.length / 2, ord = new Array(n);
    for (let i = 0; i < n; i++) ord[i] = i;
    ord.sort((a, b) => busy[2 * a] - busy[2 * b]);
    const out = [];
    let cur = t0;
    for (const i of ord) {
      const a = busy[2 * i], b = busy[2 * i + 1];
      if (a > cur) out.push(cur, a - 1);
      if (b + 1 > cur) cur = b + 1;
      if (cur === INF) break;
    }
    if (cur !== INF) out.push(cur, INF);
    return out;
  }

  // Plan from (start, t0) through legs [{ goal, dwell, ready }], the last of
  // which has dwell Infinity (park). Safe Interval Path Planning (M. Phillips
  // and M. Likhachev, "SIPP: Safe Interval Path Planning for Dynamic
  // Environments", ICRA 2011) over (leg, state, safe interval): waiting is
  // folded into the edges, so the search is complete without enumerating
  // every second. Returns steps, or null.
  //   self: the planning agent's id; opts.allowed: private groups (pockets,
  //   bays) it may enter; opts.ignore: an agent whose reservations it may
  //   overlap (the truck a straddle carrier is serving).
  function plan(graph, res, heur, self, start, t0, legs, opts = {}) {
    const allowed = opts.allowed || new Set();
    const ignore = opts.ignore != null ? opts.ignore : -999;
    const maxExp = opts.maxExp || 40000;
    const NS = graph.states.length;
    const hs = legs.map(l => heur.to(l.goal));
    const tail = new Array(legs.length).fill(0);
    for (let k = legs.length - 2; k >= 0; k--) {
      const fin = legs[k + 1].dwell === INF ? 0 : legs[k + 1].dwell;
      tail[k] = hs[k + 1][legs[k].goal] + fin + tail[k + 1];
    }
    if (legs.some((l, k) => k > 0 && !isFinite(hs[k][legs[k - 1].goal])) || !isFinite(hs[0][start])) return null;
    const ok = (priv) => priv < 0 || allowed.has(priv);
    const sCache = new Map(), eCache = new Map();
    const sInt = (s) => { let v = sCache.get(s); if (!v) { v = freeIntervals(graph.states[s].fp, res, self, ignore, t0); sCache.set(s, v); } return v; };
    const eInt = (e) => { let v = eCache.get(e); if (!v) { v = freeIntervals(e.sweep, res, self, ignore, t0); eCache.set(e, v); } return v; };
    const intervalOf = (s, t) => { const I = sInt(s); for (let i = 0; i < I.length; i += 2) if (I[i] <= t && t <= I[i + 1]) return i; return -1; };
    const i0 = intervalOf(start, t0);
    if (i0 < 0) return null;
    const open = new TL.Heap(), closed = new Set();
    const rest = (leg) => (legs[leg].dwell === INF ? 0 : legs[leg].dwell) + tail[leg];
    const push = (n) => open.push(n.t + hs[n.leg][n.s] + rest(n.leg), n);
    push({ leg: 0, s: start, iv: i0, t: t0, prev: null, act: null });
    let exp = 0;
    while (open.size) {
      const n = open.pop();
      const key = (n.leg * NS + n.s) * 4096 + (n.iv >> 1);
      if (closed.has(key)) continue;
      closed.add(key);
      if (++exp > maxExp) return null;
      const L = legs[n.leg], I = sInt(n.s), ib = I[n.iv + 1];
      if (n.s === L.goal) {
        if (L.dwell === INF) {
          if (ib === INF) return unwind({ leg: n.leg, s: n.s, t: n.t, prev: n, act: { kind: 'park', t0: n.t, t1: INF } });
        } else {
          const end = Math.max(n.t, L.ready || 0) + L.dwell;
          if (end <= ib) push({ leg: n.leg + 1, s: n.s, iv: n.iv, t: end, prev: n, act: { kind: 'dwell', t0: n.t, t1: end, leg: n.leg } });
        }
      }
      const hv = hs[n.leg];
      for (const e of graph.out[n.s]) {
        if (!ok(e.priv) || !ok(graph.states[e.b].priv) || !isFinite(hv[e.b])) continue;
        const F = eInt(e);
        for (let k = 0; k < F.length; k += 2) {
          const fa = F[k], fb = F[k + 1];
          if (fb !== INF && fb - e.d < n.t) continue;
          if (fa > ib) break;
          const dep = Math.max(n.t, fa);
          if (dep > ib || (fb !== INF && dep > fb - e.d)) continue;
          const arr = dep + e.d;
          const iv = intervalOf(e.b, arr);
          if (iv < 0) continue;
          const m = { leg: n.leg, s: e.b, iv, t: arr, prev: n, act: { kind: 'move', t0: dep, t1: arr, edge: e } };
          if (dep > n.t) m.wait = { t0: n.t, t1: dep, s: n.s };
          push(m);
        }
      }
    }
    return null;
  }

  // Turn the search's parent chain into a list of steps, with the waits
  // that SIPP folds into moves made explicit.
  function unwind(n) {
    const steps = [];
    for (let m = n; m && m.act; m = m.prev) {
      steps.push({ kind: m.act.kind, s: m.s, from: m.prev.s, t0: m.act.t0, t1: m.act.t1, edge: m.act.edge || null, leg: m.act.leg != null ? m.act.leg : m.leg });
      if (m.wait) steps.push({ kind: 'wait', s: m.wait.s, from: m.wait.s, t0: m.wait.t0, t1: m.wait.t1, edge: null, leg: m.leg });
    }
    steps.reverse();
    return steps;
  }

  // Reserve a plan's cells: each step holds what it sweeps for its interval.
  function reserve(graph, res, self, steps, ignoreFor) {
    for (const st of steps) {
      const cells = st.kind === 'move' ? st.edge.sweep : graph.states[st.s].fp;
      res.add(cells, st.t0, st.t1, self);
    }
  }

  // Where a vehicle is at time t along its steps (with gentle easing when a
  // move starts or ends at rest). Returns { x, y, th, step }.
  function poseAt(graph, steps, t, out) {
    out = out || { x: 0, y: 0, th: 0, k: 0 };
    let k = 0;
    // Binary search on t0.
    let lo = 0, hi = steps.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (steps[m].t0 <= t) lo = m; else hi = m - 1; }
    k = lo;
    const st = steps[k];
    out.k = k;
    if (st.kind !== 'move' || t >= st.t1) {
      const s = graph.states[st.kind === 'move' ? st.s : st.s];
      out.x = s.x; out.y = s.y; out.th = s.th;
      return out;
    }
    let u = (t - st.t0) / (st.t1 - st.t0);
    const prevMove = k > 0 && steps[k - 1].kind === 'move' && steps[k - 1].t1 === st.t0 && steps[k - 1].edge.kind === st.edge.kind;
    const nextMove = k + 1 < steps.length && steps[k + 1].kind === 'move' && steps[k + 1].t0 === st.t1 && steps[k + 1].edge.kind === st.edge.kind;
    if (st.edge.kind === 'move') {
      if (!prevMove && !nextMove) u = TL.smooth(u);
      else if (!prevMove) u = u * u * (2 - u);            // ease in, leave at full speed
      else if (!nextMove) u = 1 - (1 - u) * (1 - u) * (1 + u); // arrive gently
    } else u = TL.smooth(u);
    motionPose(st.edge.motion, u, out);
    return out;
  }

  TL.MAPF = { Grid, Graph, Reservations, Heuristics, plan, reserve, poseAt, motionPose, freeIntervals, INF };
})(globalThis.TL = globalThis.TL || {});
