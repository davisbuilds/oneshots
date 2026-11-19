import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import { describe } from '../src/atlas.js';
import { ground, random } from '../src/geography.js';
import { doorway, advance, impact, barrier, EYE } from '../src/spatial.js';
import { planViews, apertureRect } from '../src/portals.js';
import { Cache } from '../src/stream.js';
import { WorldStore } from '../src/world.js';
import { opening } from '../src/walker.js';
import { Passage, duration } from '../src/passage.js';

const v = (x, y, z) => new T.Vector3(x, y, z);
const player = (id, x, y, z) => ({
  id,
  position: v(x, y, z),
  velocity: v(0, 0, -100),
  orientation: new T.Quaternion(),
});
function gate(key, x, z, yaw, to, mate) {
  return Object.assign(doorway(key, x, z, yaw), { to, mate });
}
test('one high-speed sweep resolves closely spaced mouths and a receiving wall', () => {
  const worlds = {
    a: { gates: [gate('out', 0, 0, 0, 'b', 'in')], barriers: [] },
    b: {
      gates: [gate('in', 0, 0, Math.PI, 'a', 'out'), gate('out', 0, -0.05, 0, 'c', 'in')],
      barriers: [],
    },
    c: { gates: [gate('in', 10, 2, Math.PI / 2, 'b', 'out')], barriers: [barrier(12, 2, 0.4, 4)] },
  };
  const p = player('a', 0, EYE, 8),
    events = [];
  advance(
    p,
    v(0, 0, -75),
    (id) => worlds[id],
    (_, g) => events.push(g.to)
  );
  assert.deepEqual(events, ['b', 'c']);
  assert.equal(p.id, 'c');
  assert.ok(Math.abs(p.position.x - 11.57) < 0.00001);
  assert.ok(Math.abs(p.position.z - 2) < 1e-7);
  assert.ok(p.velocity.length() < 1e-8);
  assert.ok(
    v(0, 0, -1)
      .applyQuaternion(p.orientation)
      .distanceTo(v(1, 0, 0)) < 1e-8
  );
});
test('exact endpoints allow immediate reversal for 1,000 consecutive crossings', () => {
  const a = gate('a', 0, 0, 0, 'b', 'b'),
    b = gate('b', 0, 0, Math.PI, 'a', 'a');
  const get = (id) => ({ gates: [id === 'a' ? a : b], barriers: [] });
  const p = player('a', 0, EYE, 0.5);
  let hits = 0;
  advance(p, v(0, 0, -0.5), get, () => hits++);
  assert.equal(p.id, 'b');
  for (let i = 0; i < 999; i++) {
    const sign = p.id === 'b' ? 1 : -1;
    advance(p, v(0, 0, sign * 0.01), get, () => hits++);
  }
  assert.equal(hits, 1000);
  assert.equal(p.id, 'a');
});
test('swept wall collision slides along a jamb and rejects the neighbouring corner', () => {
  const w = describe('1'),
    g = w.gates[0],
    box = barrier(3.8, 0, 1.6, 1.8);
  const p = player('1', 2.94, EYE, 2);
  advance(p, v(0.2, 0, -5), () => ({ gates: [g], barriers: [box] }));
  assert.equal(p.id, '1');
  assert.ok(p.position.z >= 1.13);
  assert.ok(p.position.x > 3.1);
  assert.equal(impact(box, v(2.65, EYE, 2), v(0, 0, -5)), null);
});
test('addresses branch beyond machine integers, regenerate geography, and return through each named mate', () => {
  const seeds = new Set(),
    samples = new Set();
  for (const root of ['1', '11', '72', '8191', '9007199254740993315870195']) {
    let id = root;
    const rand = random(Number(BigInt(root) % 65521n));
    for (let k = 0; k < 300; k++) {
      const w = describe(id),
        other = describe(id);
      assert.deepEqual(w, other);
      seeds.add(w.seed);
      samples.add(ground(w, 29, -41).toFixed(6));
      for (const g of w.gates) {
        const dst = describe(g.to),
          mate = dst.gates.find((n) => n.key === g.mate);
        assert.equal(mate.to, id);
        assert.equal(mate.mate, g.key);
      }
      const choice = rand() > 0.48 ? 'front' : 'fork';
      id = w.gates.find((g) => g.key === choice).to;
    }
  }
  assert.ok(seeds.size > 1450);
  assert.ok(samples.size > 600);
});
test('cyclic screen-space visibility conserves a depth and pass budget at extreme angles', () => {
  const w = describe('3'),
    cam = new T.PerspectiveCamera(67, 1.7, 0.06, 680);
  cam.position.set(-9.4, EYE, 8);
  cam.updateMatrixWorld();
  for (const [limit, budget] of [
    [4, 1],
    [2, 6],
    [4, 6],
  ]) {
    const nodes = planViews(
      { world: w, camera: cam, depth: 0, rect: [-1, -1, 1, 1] },
      describe,
      limit,
      budget
    );
    assert.ok(nodes.length <= budget + 1);
    assert.ok(nodes.every((n) => n.depth <= limit));
    assert.ok(nodes.some((n) => n.entrance === 'recto'));
    if (limit === 4 && budget === 6) assert.ok(nodes.some((n) => n.depth > 1 && n.world.id === '3'));
  }
  const g = doorway('oblique', 0, 0);
  cam.position.set(0, EYE, 0.002);
  cam.rotation.y = -Math.PI / 2;
  cam.updateMatrixWorld();
  const r = apertureRect(g, cam);
  assert.ok(r && r.every(Number.isFinite));
  assert.ok(r[2] - r[0] > 0.65 && r[2] - r[0] < 1.1);
  cam.position.z = 0;
  cam.updateMatrixWorld();
  assert.deepEqual(apertureRect(g, cam), [-1, -1, 1, 1]);
  cam.position.set(0, 2, 3);
  cam.rotation.y = Math.PI;
  cam.updateMatrixWorld();
  assert.equal(apertureRect(g, cam), null);
});
test('resource caches evict exactly once and shared source meshes survive world disposal', () => {
  const disposed = [];
  const cache = new Cache(
    2,
    (k) => k,
    (k) => disposed.push(k)
  );
  for (const k of ['a', 'b', 'a', 'c', 'c', 'd']) cache.get(k);
  assert.deepEqual(disposed, ['b', 'a']);
  cache.clear();
  assert.deepEqual(disposed, ['b', 'a', 'c', 'd']);
  const store = new WorldStore(),
    first = store.get('2');
  const camera = new T.PerspectiveCamera();
  let tilesDisposed = 0,
    batchesDisposed = 0;
  first.prepare(camera, 0, 0);
  for (const t of first.field.cache.entries.values())
    t.children[0].geometry.addEventListener('dispose', () => tilesDisposed++);
  for (const m of first.scene.children)
    if (m.isInstancedMesh) m.addEventListener('dispose', () => batchesDisposed++);
  for (let i = 0; i < 18; i++) {
    camera.position.x += 35;
    first.prepare(camera, i, 0);
    assert.ok(first.field.cache.entries.size <= 64);
  }
  for (let i = 3; i < 17; i++) store.get(String(i));
  assert.equal(store.entries.size, 8);
  assert.equal(tilesDisposed, 25);
  assert.ok(batchesDisposed > 4);
  const next = store.get('2');
  assert.notEqual(first, next);
  assert.deepEqual(first.gates, next.gates);
  store.clear();
});
test('the full cinematic crosses the ordinary collision engine into the west aisle loop in 52 seconds', () => {
  const store = new WorldStore(),
    p = opening(),
    tour = new Passage(),
    seen = [];
  for (let k = 0; k < 4000; k++)
    if (
      tour.step(
        p,
        1 / 60,
        (id) => store.get(id),
        (from, g) => seen.push([from, g.key, g.to])
      )
    )
      break;
  assert.equal(duration, 52);
  assert.ok(Math.abs(tour.elapsed - duration) < 1e-8);
  assert.deepEqual(seen, [
    ['1', 'front', '2'],
    ['2', 'front', '4'],
    ['4', 'front', '8'],
    ['8', 'front', '16'],
    ['16', 'verso', '16'],
  ]);
  store.clear();
});
test('48 seeded walks survive 49,152 physical crossings with bounded resident graph state', () => {
  for (let seed = 1; seed <= 48; seed++) {
    const rng = random(seed),
      cache = new Cache(8, describe, () => {});
    let id = String(seed);
    for (let k = 0; k < 1024; k++) {
      const w = cache.get(id),
        g = w.gates[Math.floor(rng() * w.gates.length)],
        before = v(0.3, EYE, 0.6).applyMatrix4(g.frame);
      const p = player(id, before.x, before.y, before.z);
      p.velocity.copy(g.normal).multiplyScalar(-80);
      let crossed = 0;
      advance(
        p,
        g.normal.clone().multiplyScalar(-1),
        (key) => cache.get(key),
        () => crossed++
      );
      assert.equal(crossed, 1);
      assert.equal(p.id, g.to);
      assert.ok(cache.entries.size <= 8);
      const exit = cache.get(p.id).gates.find((gate) => gate.key === g.mate);
      assert.ok(Math.abs(p.position.clone().applyMatrix4(exit.inverse).z - 0.4) < 2e-6);
      id = p.id;
    }
  }
});

test('regenerated GPU input buffers agree per seed and across high/low terrain seams', async () => {
  const { terrainTile } = await import('../src/terrain.js');
  const world = describe('2'),
    high = terrainTile(world, 0, 0, 24),
    low = terrainTile(world, 1, 0, 8),
    repeat = terrainTile(describe('2'), 0, 0, 24);
  for (const attr of ['position', 'color', 'normal'])
    assert.deepEqual(high.geometry.attributes[attr].array, repeat.geometry.attributes[attr].array);
  for (let j = 0; j <= 8; j++) {
    const i = (j * 3 * 25 + 24) * 3,
      k = j * 9 * 3;
    for (const attr of ['position', 'normal', 'color']) {
      const a = high.geometry.attributes[attr].array,
        b = low.geometry.attributes[attr].array;
      for (let d = 0; d < 3; d++) assert.ok(Math.abs(a[i + d] - b[k + d]) < 1e-6);
    }
  }
  const other = terrainTile({ ...world, seed: world.seed + 1 }, 0, 0, 24);
  assert.notDeepEqual(high.geometry.attributes.position.array, other.geometry.attributes.position.array);
  for (const m of [high, low, repeat, other]) m.geometry.dispose();
});
