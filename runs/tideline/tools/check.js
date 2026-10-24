// check.js: run the terminal headless over many seeds and check, from the
// trajectories the vehicles actually drove, that nothing ever collides,
// nothing waits for ever, and no ship leaves its stability limits.
//
//   node tools/check.js [--seeds 24] [--hours 6] [--monkey] [--json out.json]
//
// It does not trust the planner. Every straddle carrier and truck is rebuilt
// as its real rectangle (10 x 5 m, 16.5 x 2.6 m) every quarter second and
// tested pairwise with the separating-axis theorem, and against the crane
// legs on the rail and any spreader lowered over the lanes. The only
// overlaps allowed are a carrier lined up over a transfer bay straddling a
// truck standing still in that bay, and a spreader over the carrier taking
// or delivering that very box. Ships are tested against the quay, the
// breakwater and each other, and every crane with work must keep moving.
'use strict';
const TL = require('../src/node.js');
const L = TL.Layout, M = TL.MAPF;

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEEDS = +opt('--seeds', 24), HOURS = +opt('--hours', 6), MONKEY = args.includes('--monkey') || args.includes('--all');
const DT = 0.25;

// Oriented rectangles: { x, y, th, hl, hw }.
function overlap(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const r = a.hl + a.hw + b.hl + b.hw;
  if (dx * dx + dy * dy > r * r) return false;
  const axes = [a.th, a.th + Math.PI / 2, b.th, b.th + Math.PI / 2];
  for (const t of axes) {
    const ux = Math.cos(t), uy = Math.sin(t);
    const pa = a.hl * Math.abs(Math.cos(a.th) * ux + Math.sin(a.th) * uy) + a.hw * Math.abs(-Math.sin(a.th) * ux + Math.cos(a.th) * uy);
    const pb = b.hl * Math.abs(Math.cos(b.th) * ux + Math.sin(b.th) * uy) + b.hw * Math.abs(-Math.sin(b.th) * ux + Math.cos(b.th) * uy);
    if (Math.abs(dx * ux + dy * uy) >= pa + pb - 1e-6) return false;
  }
  return true;
}

const BREAKWATER = { x: -140, y: -330, th: 0, hl: 210, hw: 7 };

// Random actions a player might take, to show the guarantees hold under them.
function monkey(sim, rng, log) {
  const r = rng();
  if (r < 0.4) {
    // Re-plan a random pending box to a random slot.
    const call = rng.pick(sim.calls.filter(c => c.state === 'working'));
    if (!call) return;
    const pend = call.plan.stacks.flat().filter(b => !b.loaded && !b.reserved);
    if (!pend.length) return;
    const box = rng.pick(pend), st = rng.pick(call.vessel.stacks);
    const res = sim.replan(call, box, st.id, st.boxes.filter(TL.Stow.isRob).length + rng.int(3));
    log.replans[res.ok ? 'ok' : 'refused']++;
  } else if (r < 0.7) {
    const call = rng.pick(sim.calls.filter(c => c.state === 'planned' || c.state === 'anchored'));
    if (!call) return;
    const res = sim.moveCall(call, rng.int(3), call.etb + (rng() - 0.4) * 6 * 3600);
    log.moves[res.ok ? 'ok' : 'refused']++;
  } else {
    const c = rng.pick(sim.cranes), call = rng.pick(sim.calls.filter(x => x.state === 'working').concat([null]));
    const res = sim.assignCrane(c.k, call);
    log.cranes[res.ok ? 'ok' : 'refused']++;
  }
}

function checkSeed(seed) {
  const t0 = Date.now();
  const sim = new TL.Sim({ seed, trace: true, truckRate: 30 + (seed * 7) % 40 });
  const start = sim.t, end = start + HOURS * 3600;
  const craneX0 = sim.cranes.map(c => c.x);
  const rng = TL.rng(seed * 977 + 1);
  const log = { replans: { ok: 0, refused: 0 }, moves: { ok: 0, refused: 0 }, cranes: { ok: 0, refused: 0 } };
  const fail = [];
  let worstHeel = 0, minGM = Infinity, lastProgress = start, maxIdle = 0, stab = 0;
  const departures = [];
  let shipHits = 0;
  const craneFree = sim.cranes.map(() => start), craneStuck = sim.cranes.map(() => false);
  const firstShip = [];
  while (sim.t < end) {
    sim.step();
    // Ships, moored or moving, stay in open water: clear of the quay, the
    // breakwater and each other.
    if (sim.t % 10 === 0) {
      const hulls = sim.calls.filter(c => c.state !== 'planned' && c.state !== 'gone').map(c => ({ c, r: sim.hullRect(c) }));
      const hit = (msg) => { shipHits++; if (firstShip.length < 3) firstShip.push(`t=${sim.t} ${msg}`); };
      const moving = sim.calls.filter(c => c.state === 'approach' || c.state === 'departing');
      if (moving.length > 1) hit(`${moving.map(c => c.vessel.name).join(' and ')} under way together`);
      for (const h of hulls) {
        if (h.r.ymax > -1.0) hit(`${h.c.vessel.name} (${h.c.state}) reaches y=${h.r.ymax.toFixed(1)} m, over the quay`);
        if (overlap(h.r, BREAKWATER)) hit(`${h.c.vessel.name} (${h.c.state}) hits the breakwater`);
      }
      for (let i = 0; i < hulls.length; i++) for (let j = i + 1; j < hulls.length; j++)
        if (overlap(hulls[i].r, hulls[j].r)) hit(`${hulls[i].c.vessel.name} (${hulls[i].c.state}) x ${hulls[j].c.vessel.name} (${hulls[j].c.state})`);
    }
    if (MONKEY && sim.t % 600 === 0) monkey(sim, rng, log);
    // Each crane: while it is assigned to a ship that still has work, it
    // must not go 30 minutes without a move (or wait that long to leave).
    if (sim.t % 60 === 0) for (const c of sim.cranes) {
      const work = (c.call && c.call.state === 'working' && c.bays.some(b => sim.bayWork(c.call, b) > 0)) || c.pendingSet;
      const last = Math.max(c.moves.length ? c.moves[c.moves.length - 1] : start, craneFree[c.k]);
      if (!work) craneFree[c.k] = sim.t;
      else if (sim.t - last > 1800 && !craneStuck[c.k]) { craneStuck[c.k] = true; fail.push(`t=${sim.t}: ${c.id} (${c.status}${c.pendingSet ? ', reassigning' : ''}) no move for 30 min`); }
    }
    if (sim.t % 60 === 0) {
      for (const call of sim.calls) {
        if (call.state !== 'working') continue;
        const c = sim.condition(call);
        worstHeel = Math.max(worstHeel, Math.abs(c.heel)); minGM = Math.min(minGM, c.GM);
        const a = TL.Stability.assess(c, { depth: L.BERTHS[call.berth].depth });
        if (a.state === 'out') { stab++; if (stab < 4) fail.push(`t=${sim.t}: ${call.vessel.name} out of limits: ${a.out.join('; ')}`); }
      }
      // Progress: while any ship has work and cranes, boxes must keep moving.
      const last = sim.stats.moves.length ? sim.stats.moves[sim.stats.moves.length - 1].t : start;
      const busy = sim.calls.some(c => c.state === 'working' && c.cranes.length);
      if (busy) { maxIdle = Math.max(maxIdle, sim.t - Math.max(last, lastProgress)); } else lastProgress = sim.t;
    }
    for (const call of sim.calls) if (call.state === 'departing' && !call._checked) {
      call._checked = true;
      const d = TL.Stability.assess(TL.Stability.condition(call.vessel, TL.SIM.sumsOf(call.vessel)), { departure: false });
      departures.push(call.vessel.name);
      if (d.state === 'out') fail.push(`${call.vessel.name} sailed out of limits: ${d.out.join('; ')}`);
    }
  }
  if (maxIdle > 1800) fail.push(`no crane move for ${(maxIdle / 60).toFixed(0)} min while work was waiting`);

  // ── Geometry, sampled ─────────────────────────────────────────────────
  const SC = { hl: L.SC_BODY.hl, hw: L.SC_BODY.hw }, TR = { hl: L.TRUCK_BODY.hl, hw: L.TRUCK_BODY.hw };
  const p = { x: 0, y: 0, th: 0, k: 0 };
  const scPose = (sc, t) => { M.poseAt(sim.scG, sc.hist, t, p); return { x: p.x, y: p.y, th: p.th, hl: SC.hl, hw: SC.hw }; };
  const trucks = sim.trucks.concat(sim._goneTrucks || []).filter(tr => tr.hist && tr.hist.length);
  const trPose = (tr, t) => {
    const h = tr.hist; if (t < h[0].t0) return null;
    M.poseAt(sim.trG, h, t, p);
    const st = sim.trG.states[h[Math.min(p.k, h.length - 1)].s];
    if (p.x > L.cx(L.NX - 2) + 1 || st.tag === 'outside') return null;
    if (st.tag === 'sink' && t >= h[h.length - 1].t0) return null;
    return { x: p.x, y: p.y, th: p.th, hl: TR.hl, hw: TR.hw };
  };
  const craneX = (c, t) => {
    let x = craneX0[c.k];
    for (const g of c.gHist || []) { if (g.t0 > t) break; x = TL.Crane.evalGantry(g, Math.min(t, g.end)); }
    return x;
  };
  let samples = 0, pairs = 0, collisions = 0, legHits = 0, spreaderHits = 0, straddles = 0;
  const first = [], firstLeg = [], firstSp = [];
  for (let t = start + 1; t < end; t += DT) {
    samples++;
    const bodies = [];
    for (const sc of sim.scs) bodies.push({ kind: 'sc', k: sc.k, r: scPose(sc, t) });
    for (const tr of trucks) { const r = trPose(tr, t); if (r) bodies.push({ kind: 'tr', k: tr.k, r }); }
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      pairs++;
      if (!overlap(a.r, b.r)) continue;
      if (a.kind !== b.kind) {
        // A carrier may straddle a trailer only when the truck stands still
        // in its transfer bay and the carrier is lined up over that bay.
        const s = a.kind === 'sc' ? a : b, tr = a.kind === 'sc' ? b : a;
        const dock = sim.trG.dock.map(d => sim.trG.states[d]).find(d => Math.abs(d.x - tr.r.x) < 0.05 && Math.abs(d.y - tr.r.y) < 0.05 && Math.abs(Math.sin(d.th - tr.r.th)) < 1e-3);
        if (dock && Math.abs(s.r.x - dock.x) < 0.3 && Math.abs(Math.cos(s.r.th)) < 1e-3) { straddles++; continue; }
      }
      collisions++;
      if (first.length < 3) first.push(`t=${t.toFixed(2)} ${a.kind}${a.k} x ${b.kind}${b.k} at (${a.r.x.toFixed(1)}, ${a.r.y.toFixed(1)})`);
    }
    // Crane legs (landside rail) and lowered spreaders.
    for (const c of sim.cranes) {
      const x = craneX(c, t);
      for (const dx of [-9, 9]) {
        const leg = { x: x + dx, y: L.RAIL.land, th: 0, hl: 4.0, hw: 1.5 };
        for (const b of bodies) if (b.kind === 'sc' && overlap(leg, b.r)) { legHits++; if (firstLeg.length < 3) firstLeg.push(`t=${t.toFixed(2)} sc${b.k} hits ${c.id} leg`); }
      }
      const ci = (c.cycHist || []).findIndex(q => t >= q.t0 && t <= q.end);
      if (ci < 0) continue;
      const cyc = c.cycHist[ci];
      const sp = TL.Crane.evalCycle(cyc, t);
      if (sp.z > 15.5 || sp.y < 5 || sp.y > 34) continue;
      const spreader = { x, y: sp.y, th: 0, hl: 6.2, hw: 1.3 };
      // Boxes the spreader may be touching now: this cycle's, and the one it
      // has just let go of (a new cycle starts by lifting off it).
      const boxes = [cyc.box].concat(ci > 0 && t - c.cycHist[ci - 1].end < 30 ? [c.cycHist[ci - 1].box] : []);
      for (const b of bodies) {
        if (b.kind !== 'sc' || !overlap(spreader, b.r)) continue;
        const sc = sim.scs[b.k];
        // The carrier receiving or delivering that very box is meant to be there.
        const ok = (sim.taskLog || []).some(tk => tk.sc === sc && boxes.includes(tk.box) && t >= tk.assignT - 1 && t <= (tk.doneT != null ? tk.doneT + 6 : Infinity));
        if (!ok) { spreaderHits++; if (firstSp.length < 3) firstSp.push(`t=${t.toFixed(2)} ${c.id} spreader at ${sp.z.toFixed(1)} m over sc${b.k}`); }
      }
    }
  }
  if (collisions) fail.push(`${collisions} vehicle overlaps (first: ${first.slice(0, 3).join('; ')})`);
  if (legHits) fail.push(`${legHits} carrier / crane-leg overlaps (first: ${firstLeg.join('; ')})`);
  if (spreaderHits) fail.push(`${spreaderHits} spreader / carrier conflicts (first: ${firstSp.join('; ')})`);

  // ── Liveness ──────────────────────────────────────────────────────────
  let maxTask = 0, openOld = 0, maxWait = 0;
  for (const tk of sim.tasks) {
    if (tk.state === 'done') maxTask = Math.max(maxTask, tk.doneT - tk.created);
    else if (end - tk.created > 5400 && !(tk.after && tk.after.some(a => a.state !== 'done'))) openOld++;
  }
  for (const sc of sim.scs) for (const st of sc.hist) {
    if (st.kind !== 'wait') continue;
    const s = sim.scG.states[st.s];
    if (s.priv >= 0) continue;               // waiting in a pocket or bay is parking
    maxWait = Math.max(maxWait, Math.min(st.t1, end) - st.t0);
  }
  for (const tr of trucks) if (tr.gateInT != null && tr.state !== 'gone' && end - tr.gateInT > 3 * 3600) fail.push(`truck ${tr.id} inside for over 3 h`);
  if (openOld) fail.push(`${openOld} tasks open for more than 90 min`);
  if (maxWait > 900) fail.push(`a carrier waited ${maxWait} s in a lane`);
  if (shipHits) fail.push(`${shipHits} ship clearance failures (first: ${firstShip.join("; ")})`);
  if (sim.stats.violations) fail.push(`${sim.stats.violations} stability violations after crane moves`);
  return {
    seed, ms: Date.now() - t0, moves: sim.stats.moves.filter(m => m.t > start).length, tasks: sim.tasks.filter(t => t.state === 'done').length,
    plans: sim.stats.plans, fallbacks: sim.stats.fallbacks, samples, pairs, straddles, collisions, legHits, spreaderHits, maxTask, maxWait,
    worstHeel, minGM, holds: sim.stats.holds, rehandles: sim.stats.rehandles, trucks: sim.stats.truckTurns.length, departures, log, fail,
  };
}

const results = [];
console.log(`checking ${SEEDS} seeds x ${HOURS} h${MONKEY ? ' with random player actions' : ''}, sampling every ${DT} s`);
for (let s = 1; s <= SEEDS; s++) {
  const r = checkSeed(s);
  results.push(r);
  console.log(`seed ${String(s).padStart(3)}  ${r.fail.length ? 'FAIL' : 'ok  '}  moves ${String(r.moves).padStart(4)}  tasks ${String(r.tasks).padStart(4)}  trucks ${String(r.trucks).padStart(3)}  pairs ${(r.pairs / 1e6).toFixed(1)}M  overlaps ${r.collisions}  max wait ${r.maxWait}s  max heel ${r.worstHeel.toFixed(2)}°  min GM ${r.minGM.toFixed(2)} m  holds ${r.holds}  fallbacks ${r.fallbacks}  ${(r.ms / 1000).toFixed(1)}s` + (MONKEY ? `  actions ${JSON.stringify(r.log)}` : ''));
  for (const f of r.fail) console.log('      ' + f);
}
const bad = results.filter(r => r.fail.length);
const tot = (k) => results.reduce((n, r) => n + r[k], 0);
console.log(`\n${results.length - bad.length}/${results.length} seeds clean. ${tot('moves')} crane moves, ${tot('tasks')} carrier jobs, ${tot('trucks')} truck visits, ${(tot('pairs') / 1e6).toFixed(0)}M pair tests, ${tot('collisions') + tot('legHits') + tot('spreaderHits')} overlaps, ${tot('fallbacks')} planner fallbacks.`);
const out = opt('--json', null);
if (out) require('fs').writeFileSync(out, JSON.stringify(results.map(r => Object.assign({}, r, { log: r.log })), null, 1));
process.exit(bad.length ? 1 : 0);
