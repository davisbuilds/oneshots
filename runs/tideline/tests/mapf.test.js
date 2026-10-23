// The planner: free intervals, safe-interval search, and the guarantees the
// terminal relies on (no shared instants, a plan always exists from a pocket).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TL = require('../src/node.js');
const M = TL.MAPF, L = TL.Layout;

test('free intervals are the complement of other owners’ reservations', () => {
  const res = new M.Reservations(4);
  res.add([0], 10, 20, 1); res.add([1], 15, 30, 2); res.add([0], 5, 8, 9);
  assert.deepEqual(M.freeIntervals(Int32Array.from([0, 1]), res, 9, -1, 0), [0, 9, 31, Infinity]);
  assert.deepEqual(M.freeIntervals(Int32Array.from([0]), res, 1, -1, 0), [0, 4, 9, Infinity]);
  // Closed intervals: a cell freed at 20 can be entered at 21, not at 20.
  assert.equal(res.free([0], 20, 25, 3), false);
  assert.equal(res.free([0], 21, 25, 3), true);
});

test('the terminal layout is well-formed: pockets private, every goal reachable', () => {
  const g = L.buildScGraph(), h = new M.Heuristics(g);
  assert.deepEqual(g.problems, []);
  assert.deepEqual(L.buildTruckGraph().problems, []);
  const goals = g.bayStates.concat([g.S(30, 2, 0), g.S(100, 3, 0), g.S(10, 10, 1), g.S(80, 40, 1)]);
  for (const goal of goals) {
    const to = h.to(goal);
    for (const p of g.pocketStates) assert.ok(isFinite(to[p]) && isFinite(h.to(p)[goal]), `pocket ${p} <-> ${goal}`);
  }
});

test('carriers planned one after another never share a cell at the same instant', () => {
  const g = L.buildScGraph(), res = new M.Reservations(L.NX * L.NY), H = new M.Heuristics(g);
  const rng = TL.rng(5), N = 12, plans = [];
  for (let k = 0; k < N; k++) res.add(g.states[g.pocketStates[k]].fp, 0, Infinity, k);
  const goals = [];
  for (const B of L.BLOCKS) for (let i = B.i0; i <= B.i1; i += 5) goals.push(g.S(i, B.slots[3], 1));
  for (let k = 0; k < N; k++) {
    const fin = N + k;
    res.release(k, 0);
    const steps = M.plan(g, res, H, k, g.pocketStates[k], 0, [{ goal: rng.pick(goals), dwell: 20 }, { goal: rng.pick(goals), dwell: 15 }, { goal: g.pocketStates[fin], dwell: Infinity }], { allowed: new Set([k, fin]) });
    assert.ok(steps, `agent ${k} found a plan`);
    M.reserve(g, res, k, steps);
    plans.push(steps);
  }
  // Every cell's intervals from different owners are disjoint.
  for (let c = 0; c < res.cells.length; c++) {
    const iv = res.ownersAt(c);
    for (let i = 0; i < iv.length; i++) for (let j = i + 1; j < iv.length; j++) {
      if (iv[i][2] === iv[j][2]) continue;
      assert.ok(iv[i][1] < iv[j][0] || iv[j][1] < iv[i][0], `cell ${c}: ${iv[i]} vs ${iv[j]}`);
    }
  }
  // Each plan ends parked in its own pocket.
  plans.forEach((p, k) => assert.equal(p[p.length - 1].kind, 'park'));
});

test('from a pocket a plan exists even when the network is busy (wait, then go)', () => {
  const g = L.buildScGraph(), res = new M.Reservations(L.NX * L.NY), H = new M.Heuristics(g);
  // Block the exit lane for a long stretch with another owner's reservation.
  const p0 = g.pocketStates[0];
  const exit = g.S(L.POCKETS[0].i, 55, 1);
  res.add(g.states[exit].fp, 0, 500, 99);
  res.add(g.states[p0].fp, 0, Infinity, 0);
  res.release(0, 0);
  const steps = M.plan(g, res, H, 0, p0, 0, [{ goal: g.S(30, 2, 0), dwell: 10 }, { goal: g.pocketStates[1], dwell: Infinity }], { allowed: new Set([0, 1]) });
  assert.ok(steps, 'planned');
  const firstMove = steps.find(s => s.kind === 'move');
  assert.ok(firstMove.t0 > 500 - 3, 'waited in the pocket until the lane cleared');
});
