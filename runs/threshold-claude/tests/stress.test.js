// A short version of tools/stress.mjs: the real controller hops through
// generated doorways in two universes and must arrive, stand and come back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runStress } from '../tools/stress.mjs';

test('hopping through 120 generated doorways in two universes', () => {
  const r = runStress({ hops: 60, seeds: 2, log: () => {} });
  assert.equal(r.failures.length, 0, JSON.stringify(r.failures.slice(0, 5)));
  assert.ok(r.total >= 110 && r.roundTrips >= 20);
  assert.ok(Object.keys(r.archetypes).length >= 6, 'several archetypes visited');
});
