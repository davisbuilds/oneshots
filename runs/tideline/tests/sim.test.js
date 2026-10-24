// The terminal as a whole: deterministic, realistic crane cycles, and an
// hour of operation that the checker's criteria accept.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TL = require('../src/node.js');

test('same seed, same terminal', () => {
  const a = new TL.Sim({ seed: 9 }), b = new TL.Sim({ seed: 9 });
  a.run(1200); b.run(1200);
  assert.equal(a.stats.moves.length, b.stats.moves.length);
  assert.equal(a.tasks.length, b.tasks.length);
  assert.deepEqual(a.scs.map(s => s.steps[s.steps.length - 1].s), b.scs.map(s => s.steps[s.steps.length - 1].s));
});

test('a crane cycle takes 80 to 150 s, so a crane makes 25 to 45 moves an hour unhindered', () => {
  const C = TL.Crane;
  // Discharge from a deck stack 20 m out, 14 m up, to the buffer 16 m in.
  const m1 = C.move(16, 22, -20, 14, 26, false, 0);
  const m2 = C.move(-20, 14, 16, 2.9, 26 + 2.9, true, m1.end + C.K.lock);
  const m3 = C.move(16, 2.9, 16, 22, 0, false, m2.end + C.K.unlock);
  const T = m3.end;
  assert.ok(T > 80 && T < 150, `cycle ${T.toFixed(1)} s`);
  // Profiles end exactly where they should.
  assert.deepEqual([C.evalMove(m2, m2.end).y, +C.evalMove(m2, m2.end).z.toFixed(6)], [16, 2.9]);
});

test('an hour of operation: moves happen, stability holds, nothing is stuck', () => {
  const sim = new TL.Sim({ seed: 4 });
  const m0 = sim.stats.moves.length;
  sim.run(3600);
  const moves = sim.stats.moves.length - m0;
  assert.ok(moves > 80, `${moves} crane moves`);
  assert.equal(sim.stats.violations || 0, 0);
  for (const call of sim.calls.filter(c => c.state === 'working')) {
    const c = sim.condition(call);
    assert.ok(Math.abs(c.heel) < 2 && c.GM > 0.15, `${call.vessel.name}: heel ${c.heel}, GM ${c.GM}`);
  }
  const old = sim.tasks.filter(t => t.state !== 'done' && sim.t - t.created > 2400 && !(t.after && t.after.some(a => a.state !== 'done')));
  assert.equal(old.length, 0, 'no task waits more than 40 minutes');
});

test('every call’s generated load plan is legal at its berth', () => {
  for (const seed of [1, 2, 3]) {
    const sim = new TL.Sim({ seed });
    for (const call of sim.calls) {
      const v = TL.Stow.validatePlan(call.vessel, call.plan, { depth: TL.Layout.BERTHS[call.berth].depth });
      assert.ok(v.ok, `seed ${seed} ${call.vessel.name}: ${v.errs.join('; ')}`);
    }
  }
});

test('ships coming alongside and leaving keep clear of the quay', () => {
  // Northmere Wren approaches berth 3 in the first hour, works, and sails at
  // about 16 h (past the first export a truck delivers being loaded).
  const sim = new TL.Sim({ seed: 1 });
  const wren = sim.calls.find(c => c.vessel.name === 'Northmere Wren');
  const seen = new Set();
  for (let i = 0; i < 18 * 3600 && wren.state !== 'gone'; i++) {
    sim.step();
    if (sim.t % 30) continue;
    seen.add(wren.state);
    const r = sim.hullRect(wren);
    assert.ok(r.ymax < -1, `${wren.state} at t=${sim.t}: hull reaches y=${r.ymax.toFixed(1)} m`);
  }
  assert.deepEqual([...seen].sort(), ['approach', 'departing', 'working']);
});

test('two pending crane reassignments cannot make cranes pass each other', () => {
  const sim = new TL.Sim({ seed: 1 });
  const busy = (c) => c.state === 'cycle' || c.inbound > 0;
  while (!(busy(sim.cranes[2]) && busy(sim.cranes[3]))) sim.step();
  // QC-03 to the second ship and QC-04 to the first: together, a swap.
  const a = sim.assignCrane(2, sim.calls[1]), b = sim.assignCrane(3, sim.calls[0]);
  assert.ok(!(a.ok && b.ok), 'both accepted');
  sim.run(2 * 3600);
  for (const call of sim.calls.filter(c => c.state === 'working')) {
    const ks = call.cranes.slice().sort((x, y) => x - y);
    assert.equal(ks.length ? ks[ks.length - 1] - ks[0] + 1 : 0, ks.length, `${call.vessel.name} has cranes ${ks}`);
  }
  for (const c of sim.cranes) assert.ok(!c.pendingSet, `${c.id} still waiting to reassign`);
});

test('a call moved onto a berth never overlaps another call there', () => {
  const sim = new TL.Sim({ seed: 1 });
  const halyard = sim.calls.find(c => c.vessel.name === 'Corvane Halyard');
  // Dropped on berth 1 inside Alder Saffron's window.
  const r = sim.moveCall(halyard, 0, 15 * 3600);
  assert.ok(r.ok, r.errs && r.errs.join('; '));
  const live = sim.calls.filter(c => c.state !== 'gone');
  for (const a of live) for (const b of live) {
    if (a === b || a.berth !== b.berth) continue;
    const wa = sim.callWindow(a), wb = sim.callWindow(b);
    assert.ok(wa.end <= wb.start || wb.end <= wa.start, `${a.vessel.name} and ${b.vessel.name} overlap on ${TL.Layout.BERTHS[a.berth].id}`);
  }
});

// Oriented rectangles overlap (separating axes), as in tools/check.js.
function overlap(a, b) {
  for (const t of [a.th, a.th + Math.PI / 2, b.th, b.th + Math.PI / 2]) {
    const ux = Math.cos(t), uy = Math.sin(t);
    const r = (o) => o.hl * Math.abs(Math.cos(o.th) * ux + Math.sin(o.th) * uy) + o.hw * Math.abs(-Math.sin(o.th) * ux + Math.cos(o.th) * uy);
    if (Math.abs((b.x - a.x) * ux + (b.y - a.y) * uy) >= r(a) + r(b)) return false;
  }
  return true;
}

test('a ship ready to sail waits while another comes in, and their hulls never meet', () => {
  const sim = new TL.Sim({ seed: 1 });
  const wren = sim.calls.find(c => c.vessel.name === 'Northmere Wren'), brindle = sim.calls.find(c => c.vessel.name === 'Brindle Aster');
  assert.equal(wren.state, 'approach');
  // Brindle Aster's work is done while Wren is still coming in to the next berth.
  brindle.done.d = brindle.planned.d; brindle.done.l = brindle.plan.count();
  for (const k of brindle.cranes.slice().reverse()) sim.assignCrane(k, null);
  let sailed = null;
  for (let i = 0; i < 3 * 3600; i++) {
    sim.step();
    const moving = sim.calls.filter(c => c.state === 'approach' || c.state === 'departing');
    assert.ok(moving.length <= 1, `t=${sim.t}: ${moving.map(c => c.vessel.name).join(' and ')} under way together`);
    if (brindle.state === 'departing' && sailed == null) sailed = sim.t;
    // Waiting alongside, its projected departure allows for the wait.
    if (brindle.state === 'working' && wren.state === 'approach') assert.ok(sim.projectETD(brindle) >= wren.etb + 1800, `ETD ${sim.projectETD(brindle)} before Wren is in (${wren.etb})`);
    if (sim.t % 5) continue;
    const live = sim.calls.filter(c => c.state !== 'planned' && c.state !== 'gone');
    for (const a of live) for (const b of live) if (a !== b) assert.ok(!overlap(sim.hullRect(a), sim.hullRect(b)), `t=${sim.t}: ${a.vessel.name} x ${b.vessel.name}`);
  }
  assert.ok(sailed != null && sailed >= wren.etb, `Brindle Aster sailed at ${sailed}, Wren berthed at ${wren.etb}`);
});

test('a crane reassignment cannot be cancelled once others rely on it', () => {
  const sim = new TL.Sim({ seed: 1 });
  while (!(sim.cranes[2].state === 'cycle' || sim.cranes[2].inbound > 0)) sim.step();
  // QC-03 to the second ship, then QC-02 after it, then QC-03 back.
  const a = sim.assignCrane(2, sim.calls[1]), b = sim.assignCrane(1, sim.calls[1]), c = sim.assignCrane(2, sim.calls[0]);
  assert.ok(a.ok && b.ok, 'the first two are accepted');
  assert.ok(!c.ok, 'QC-03 cannot be called back');
  sim.run(3 * 3600);
  for (const call of sim.calls.filter(x => x.state === 'working')) {
    const ks = call.cranes.slice().sort((x, y) => x - y);
    assert.equal(ks.length ? ks[ks.length - 1] - ks[0] + 1 : 0, ks.length, `${call.vessel.name} has cranes ${ks}`);
  }
  for (const q of sim.cranes) assert.ok(!(q.status === 'Waiting for clearance' && q.clearSince != null && sim.t - q.clearSince > 1800), `${q.id} waiting since ${q.clearSince}`);
});

test('a ship at anchor waits for its berthing time, not just a free berth', () => {
  // Northmere Kittiwake waits at anchor for berth 3, due at 26 h; Northmere
  // Wren leaves that berth at about 16 h.
  const sim = new TL.Sim({ seed: 1 });
  const kitti = sim.calls.find(c => c.vessel.name === 'Northmere Kittiwake'), wren = sim.calls.find(c => c.vessel.name === 'Northmere Wren');
  kitti.state = 'anchored';
  const due = kitti.etb;
  while (wren.state !== 'gone') { sim.step(); assert.equal(kitti.state, 'anchored'); }
  while (kitti.state === 'anchored') sim.step();
  assert.ok(sim.t >= due - 3600, `came in at ${(sim.t / 3600).toFixed(1)} h, due ${(due / 3600).toFixed(1)} h`);
});

test('ships at anchor keep clear of each other, and the one due first leaves first', () => {
  // Three ships anchor for berth 1 while Corvane Lantern works there. Alder
  // Saffron, in the slot ahead, is then pushed back, so Corvane Halyard
  // (due next) has to leave past it.
  const sim = new TL.Sim({ seed: 1 });
  const by = (n) => sim.calls.find(c => c.vessel.name === n);
  const lantern = by('Corvane Lantern'), saffron = by('Alder Saffron'), halyard = by('Corvane Halyard'), kitti = by('Northmere Kittiwake');
  saffron.etb = sim.t + 3660;
  for (const [c, dt] of [[halyard, 300], [kitti, 600]]) { c.berth = 0; sim._placeCall(c); c.etb = sim.t + 3600 + dt; }
  while (kitti.state !== 'anchored') sim.step();
  assert.ok(halyard._slot > saffron._slot, 'Halyard waits behind Saffron');
  saffron.etb += 10 * 3600;
  // Lantern's work is done: it sails, and berth 1 frees.
  lantern.done.d = lantern.planned.d; lantern.done.l = lantern.plan.count();
  for (const k of lantern.cranes.slice().reverse()) sim.assignCrane(k, null);
  let n = 0;
  while (halyard.state !== 'working' && n++ < 6 * 3600) {
    sim.step();
    assert.ok(saffron.state === 'anchored' && kitti.state === 'anchored', `${saffron.state}, ${kitti.state}: only Halyard is due`);
    if (sim.t % 5) continue;
    const live = sim.calls.filter(c => c.state !== 'planned' && c.state !== 'gone');
    for (const a of live) for (const b of live) if (a !== b) assert.ok(!overlap(sim.hullRect(a), sim.hullRect(b)), `t=${sim.t}: ${a.vessel.name} (${a.state}) x ${b.vessel.name} (${b.state})`);
  }
  assert.equal(halyard.state, 'working');
});
