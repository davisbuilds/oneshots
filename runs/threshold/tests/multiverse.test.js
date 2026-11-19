// The multiverse: deterministic generation across seeds, reversible links and
// valid return paths, an unbounded connected graph, persistence of player
// changes across unloading, and bounded caches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { describe } from '../src/core/worlds/index.js';
import { latticeLinks, archetypeOf, key, UNIVERSE, parseKey } from '../src/core/multiverse.js';
import { pairXf, makePortal } from '../src/core/portal.js';
import { xmul, len, qangle } from '../src/core/math.js';
import { Space } from '../src/core/space.js';
import { scatterChunk, ScatterCache } from '../src/core/scatter.js';
import { Save } from '../src/game/save.js';
import { hash32 } from '../src/core/rng.js';

// A stable fingerprint of a descriptor's generated content (functions excluded).
function fingerprint(d) {
  const round = (k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : typeof v === 'function' ? undefined : v);
  const core = { name: d.name, epithet: d.epithet, archetype: d.archetype, atmos: d.atmos, sky: d.sky, light: d.light, materials: d.materials,
    parts: d.parts, features: d.features, portals: d.portals.map((P) => ({ slot: P.slot, p: P.xf.p, q: P.xf.q, hw: P.hw, hh: P.hh, link: P.link })),
    lodestone: d.lodestone, landmarks: d.landmarks, scatter: d.scatter.map((s) => ({ ...s, mask: undefined })) };
  let h = 0;
  const s = JSON.stringify(core, round);
  for (let i = 0; i < s.length; i++) h = hash32(h, s.charCodeAt(i));
  return { h, n: s.length };
}
const sample = (n, seed) => { const out = []; let s = seed; for (let k = 0; k < n; k++) { s = hash32(s, k); out.push(key((s % 401) - 200, (hash32(s, 7) % 401) - 200)); } return out; };

test('generation is deterministic for every seed and differs between seeds', () => {
  for (const universe of [UNIVERSE, 1, 0xdeadbeef]) {
    for (const k of ['0,0', '1,0', '2,0', '3,0', '0,0/hall', '3,0/mirror', ...sample(40, universe)]) {
      const a = describe(k, universe), b = describe(k, universe);
      assert.deepEqual(fingerprint(a), fingerprint(b), `${k} @ ${universe}`);
      // the height field and scatter are reproducible too
      if (a.heightAt) for (const [x, z] of [[0, 0], [123.4, -56.7], [-900, 412]]) assert.equal(a.heightAt(x, z), b.heightAt(x, z));
      for (const spec of a.scatter) assert.deepEqual(scatterChunk(a, spec, 1, -2), scatterChunk(b, spec, 1, -2));
    }
  }
  let differ = 0;
  for (const k of sample(60, 3)) if (fingerprint(describe(k, 1)).h !== fingerprint(describe(k, 2)).h) differ++;
  assert.ok(differ >= 58, `different universes give different worlds (${differ}/60)`);
});

test('every link is reversible, with matching size, and the round trip is the identity', () => {
  const keys = ['0,0', '1,0', '2,0', '3,0', '0,0/hall', '3,0/mirror', ...sample(400, 11)];
  let links = 0;
  for (const k of keys) {
    const d = describe(k);
    for (const P of d.portals) {
      const D = describe(P.link.world);
      assert.ok(D, `${k}#${P.slot} leads to a world (${P.link.world})`);
      const Q = D.portals.find((x) => x.slot === P.link.slot);
      assert.ok(Q, `${P.link.world} has slot ${P.link.slot}`);
      assert.equal(Q.link.world, k); assert.equal(Q.link.slot, P.slot);
      assert.ok(Math.abs(Q.hw - P.hw) < 1e-12 && Math.abs(Q.hh - P.hh) < 1e-12, 'same opening');
      assert.equal(Q.style, P.style, 'same frame');
      const id = xmul(pairXf(Q, P), pairXf(P, Q));
      assert.ok(len(id.p) < 1e-6 && qangle(id.q, [0, 0, 0, 1]) < 1e-6, 'there and back is the identity');
      links++;
    }
  }
  assert.ok(links > 1200, `checked ${links} links`);
});

test('the lattice graph is unbounded and connected along every row', () => {
  // Every world has an E and a W portal, so walking east never ends.
  for (let i = -500; i <= 500; i += 37) {
    const ls = latticeLinks(i, 3);
    assert.ok(ls.some((l) => l.slot === 'E' && l.to.world === key(i + 1, 3)));
    assert.ok(ls.some((l) => l.slot === 'W' && l.to.world === key(i - 1, 3)));
  }
  // Breadth-first from the origin reaches far rows and stays sparse.
  const seen = new Set(['0,0']), frontier = ['0,0'];
  let maxDeg = 0;
  while (frontier.length && seen.size < 4000) {
    const k = frontier.shift(), { i, j } = parseKey(k);
    const ls = latticeLinks(i, j); maxDeg = Math.max(maxDeg, ls.length);
    for (const l of ls) if (!seen.has(l.to.world)) { seen.add(l.to.world); frontier.push(l.to.world); }
  }
  const rows = new Set([...seen].map((k) => parseKey(k).j));
  assert.ok(rows.size > 20, `reached ${rows.size} different rows`);
  assert.ok(maxDeg <= 12, 'bounded degree');
  // archetypes vary
  const kinds = new Set(sample(200, 5).map((k) => { const p = parseKey(k); return archetypeOf(p.i, p.j); }));
  assert.ok(kinds.size >= 7, `archetypes used: ${[...kinds].join(', ')}`);
});

test('player changes persist independently of generation, across unloading', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const before = fingerprint(describe('1,0'));
  const save = new Save(storage);
  save.visit('1,0', { name: 'Ashmere', epithet: 'x', archetype: 'dunes', coord: [1, 0] });
  save.light('1,0');
  save.see('1,0', 'ring', 'The Sunken Ring');
  save.setPos('1,0', [1, 2, 3], [0, 0, 0, 1]);
  save.flush();
  // "unload" everything: a fresh space and a fresh save from the same storage
  const space = new Space((k) => describe(k), { capacity: 2 });
  for (const k of ['0,0', '2,0', '3,0', '1,1']) space.entry(k); // evicts 1,0 if it was there
  const again = new Save(storage);
  assert.ok(again.isLit('1,0'), 'lodestone stays lit');
  assert.deepEqual(again.data.seen['1,0'], ['ring']);
  assert.deepEqual(again.data.pos.feet, [1, 2, 3]);
  assert.equal(fingerprint(describe('1,0')).h, before.h, 'the baseline world is unchanged by the overlay');
  // a corrupt store falls back to a fresh save instead of throwing
  store.set('threshold.save.v1', '{not json');
  assert.equal(new Save(storage).data.v, 1);
});

test('caches are bounded: physics worlds and scatter chunks', () => {
  const space = new Space((k) => describe(k), { capacity: 8 });
  for (let i = 0; i < 60; i++) space.entry(key(i, -i));
  assert.equal(space.cache.size, 8);
  assert.ok(space.evictions >= 52);
  const d = describe('2,0');
  const cache = new ScatterCache(d, 32);
  for (let cx = -20; cx < 20; cx++) for (const spec of d.scatter) cache.get(spec, cx, cx * 3);
  assert.ok(cache.map.size <= 32);
  // colliders from scatter near a point are a small, bounded set
  const out = cache.colliders([10, 0, 10], 2, []);
  assert.ok(out.length < 20);
});

test('a hundred worlds across seeds generate quickly', () => {
  const t0 = performance.now();
  for (const k of sample(100, 99)) describe(k, 77);
  const ms = performance.now() - t0;
  assert.ok(ms < 4000, `100 worlds in ${ms.toFixed(0)} ms`);
});

test('pocket keys that no host declares are not worlds', () => {
  assert.equal(describe('5,5/hall'), null);
  assert.equal(describe('0,0/nothing'), null);
  void makePortal;
});
