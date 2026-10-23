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
