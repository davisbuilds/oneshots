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
