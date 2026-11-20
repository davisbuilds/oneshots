// Portal transforms, inverse transforms, round trips, fast crossings, edges,
// back-to-back and cyclic configurations. Pure math: no browser, no three.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePortal, pairXf, segmentCrossing, advance, castRay, toLocal, FLIP, clipPolygon, cameraInNearZone } from '../src/core/portal.js';
import { xmul, xinv, xpoint, xvec, qmul, qrot, qaxis, qnorm, qangle, dist, len, sub, madd, norm, dot } from '../src/core/math.js';

// Deterministic pseudo-random numbers for property tests.
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const randQuat = (r) => qnorm([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]);
const randVec = (r, s = 100) => [(r() * 2 - 1) * s, (r() * 2 - 1) * s, (r() * 2 - 1) * s];
const close = (a, b, eps = 1e-9, msg = '') => assert.ok(dist(a, b) < eps, `${msg} ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);

function pair(r, { hw = 1.5, hh = 2.5, sameWorld = false, upright = false } = {}) {
  const qa = upright ? qaxis([0, 1, 0], r() * 6.283) : randQuat(r);
  const qb = upright ? qaxis([0, 1, 0], r() * 6.283) : randQuat(r);
  const A = makePortal({ world: 'X', slot: 'a', p: randVec(r), q: qa, hw, hh, link: { world: sameWorld ? 'X' : 'Y', slot: 'b' } });
  const B = makePortal({ world: sameWorld ? 'X' : 'Y', slot: 'b', p: randVec(r), q: qb, hw, hh, link: { world: 'X', slot: 'a' } });
  return { A, B };
}
function apiFor(...portals) {
  const byId = new Map(portals.map((P) => [`${P.world}#${P.slot}`, P]));
  return {
    portals: (w) => portals.filter((P) => P.world === w),
    resolve: (P) => byId.get(`${P.link.world}#${P.link.slot}`) || null,
  };
}

test('FLIP is a half turn about +Y and its own inverse', () => {
  close(qrot(FLIP.q, [1, 2, 3]), [-1, 2, -3]);
  assert.ok(qangle(qmul(FLIP.q, FLIP.q), [0, 0, 0, 1]) < 1e-12);
});

test('pair transform: the region behind A is the region in front of B', () => {
  const r = rng(1);
  for (let i = 0; i < 200; i++) {
    const { A, B } = pair(r);
    const M = pairXf(A, B);
    const local = [r() * 2 - 1, r() * 2 - 1, -(r() * 5 + 0.01)]; // behind A (through the portal)
    const mapped = toLocal(B, xpoint(M, xpoint(A.xf, local)));
    close(mapped, [-local[0], local[1], -local[2]], 1e-9, 'behind A maps to mirrored front of B');
    assert.ok(mapped[2] > 0);
    // The opening's centre and normal correspond.
    close(xpoint(M, A.xf.p), B.xf.p, 1e-9, 'centre');
    close(xvec(M, A.n), B.n.map((v) => -v), 1e-12, 'A normal maps to -B normal (walking in = walking out)');
  }
});

test('inverse transform: M_BA ∘ M_AB is the identity for arbitrary orientations', () => {
  const r = rng(2);
  for (let i = 0; i < 500; i++) {
    const { A, B } = pair(r);
    const id = xmul(pairXf(B, A), pairXf(A, B));
    assert.ok(len(id.p) < 1e-9 && qangle(id.q, [0, 0, 0, 1]) < 1e-7, `identity ${JSON.stringify(id)}`);
    const v = randVec(r);
    close(xpoint(xinv(pairXf(A, B)), xpoint(pairXf(A, B), v)), v, 1e-9);
    close(xpoint(pairXf(B, A), xpoint(pairXf(A, B), v)), v, 1e-9);
  }
});

test('round trip traversal preserves position, orientation and velocity', () => {
  const r = rng(3);
  for (let i = 0; i < 300; i++) {
    const { A, B } = pair(r, { upright: i % 2 === 0 });
    const api = apiFor(A, B);
    // Approach A's opening from the front at a random angle.
    const target = xpoint(A.xf, [(r() * 2 - 1) * A.hw * 0.9, (r() * 2 - 1) * A.hh * 0.9, 0]);
    const inward = norm(xvec(A.xf, [(r() - 0.5) * 1.2, (r() - 0.5) * 1.2, -1]));
    const speed = 0.5 + r() * 30;
    const p0 = madd(target, inward, -speed * 0.03);
    const p1 = madd(target, inward, speed * 0.03);
    const look = randQuat(r), vel = inward.map((x) => x * speed);
    const go = advance('X', p0, p1, api);
    assert.equal(go.world, 'Y'); assert.equal(go.crossings.length, 1);
    const look2 = qnorm(qmul(go.xf.q, look)), vel2 = xvec(go.xf, vel);
    // Turn around exactly (reverse the motion) and come back.
    const back = advance('Y', go.p, madd(go.p, vel2, -0.06), api);
    assert.equal(back.world, 'X'); assert.equal(back.crossings.length, 1);
    close(back.p, p0, 1e-6, 'returns to the start');
    assert.ok(qangle(qnorm(qmul(back.xf.q, look2)), look) < 1e-6, 'orientation restored');
    close(xvec(back.xf, vel2), vel, 1e-6, 'velocity restored');
  }
});

test('fast motion: one long step crosses exactly once with no tunnelling', () => {
  const r = rng(4);
  for (let i = 0; i < 200; i++) {
    const { A, B } = pair(r);
    const api = apiFor(A, B);
    const target = xpoint(A.xf, [0.3, -0.4, 0]);
    const inward = xvec(A.xf, [0, 0, -1]);
    const step = 50 + r() * 5000; // up to 5 km in one step
    const go = advance('X', madd(target, inward, -step * r()), madd(target, inward, step), api);
    assert.equal(go.crossings.length, 1, 'exactly one crossing');
    const l = toLocal(B, go.p);
    assert.ok(l[2] > 0, 'ends in front of B');
    assert.ok(Math.abs(l[2] - step) < 1e-6 * step + 1e-6, 'carries the full remaining distance');
  }
});

test('no repeated teleportation: continuing, standing and creeping after a crossing', () => {
  const r = rng(5);
  const { A, B } = pair(r, { upright: true });
  const api = apiFor(A, B);
  const p0 = xpoint(A.xf, [0, 0, 0.01]), p1 = xpoint(A.xf, [0, 0, -0.01]);
  const go = advance('X', p0, p1, api);
  assert.equal(go.world, 'Y');
  const out = xvec(B.xf, [0, 0, 1]);
  let p = go.p;
  for (let k = 0; k < 1000; k++) { // creep forward 1 mm at a time, then stand still
    const s = advance('Y', p, madd(p, out, k < 500 ? 0.001 : 0), api);
    assert.equal(s.crossings.length, 0); p = s.p;
  }
  // Dither around the threshold in tiny random steps: the traveller is always
  // in front of the portal of the world it is in, and the world flips with
  // every crossing.
  let w = 'Y', q = xpoint(B.xf, [0.2, 0.1, 5e-5]), crossings = 0;
  for (let k = 0; k < 4000; k++) {
    const P = w === 'Y' ? B : A;
    const s = advance(w, q, madd(q, P.n, (r() - 0.55) * 2e-4), api);
    crossings += s.crossings.length; w = s.world; q = s.p;
    assert.ok(toLocal(w === 'Y' ? B : A, q)[2] >= 0, 'never behind the current portal');
    assert.equal(w, crossings % 2 === 0 ? 'Y' : 'X');
  }
  assert.ok(crossings > 0);
});

test('edges and corners: the opening is closed (inclusive) and nothing outside crosses', () => {
  const A = makePortal({ world: 'X', slot: 'a', p: [0, 0, 0], q: [0, 0, 0, 1], hw: 1, hh: 2, link: { world: 'Y', slot: 'b' } });
  const at = (x, y) => segmentCrossing(A, [x, y, 1], [x, y, -1]);
  assert.ok(at(1, 2), 'exact corner crosses');
  assert.ok(at(-1, -2) && at(1, 0) && at(0, -2));
  assert.equal(at(1 + 1e-9, 0), null);
  assert.equal(at(0, 2 + 1e-9), null);
  assert.equal(at(1.0001, 2.0001), null);
  // Diagonal through the corner region: enters the plane outside -> no crossing.
  assert.ok(segmentCrossing(A, [0.5, 0, 1], [1.5, 0, -1]), 'meets the plane exactly on the edge x = 1: inclusive');
  assert.equal(segmentCrossing(A, [0.6, 0, 1], [1.6, 0, -1]), null, 'meets the plane at x = 1.1: outside');
  // Back to front never crosses.
  assert.equal(segmentCrossing(A, [0, 0, -1], [0, 0, 1]), null);
  // Parallel motion in the plane never crosses.
  assert.equal(segmentCrossing(A, [-0.5, 0, 0], [0.5, 0, 0]), null);
  // Starting exactly on the plane counts as the front.
  assert.ok(segmentCrossing(A, [0, 0, 0], [0, 0, -1e-9]));
});

test('back-to-back portals in one frame lead to different worlds by direction', () => {
  // A faces +Z, A2 faces -Z, same rectangle. A -> Y, A2 -> Z.
  const A = makePortal({ world: 'X', slot: 'front', p: [0, 1, 0], q: [0, 0, 0, 1], hw: 1, hh: 1.5, link: { world: 'Y', slot: 'y' } });
  const A2 = makePortal({ world: 'X', slot: 'back', p: [0, 1, 0], q: qaxis([0, 1, 0], Math.PI), hw: 1, hh: 1.5, link: { world: 'Z', slot: 'z' } });
  const Bv = makePortal({ world: 'Y', slot: 'y', p: [10, 0, 5], q: qaxis([0, 1, 0], 0.7), hw: 1, hh: 1.5, link: { world: 'X', slot: 'front' } });
  const C = makePortal({ world: 'Z', slot: 'z', p: [-4, 2, 0], q: qaxis([0, 1, 0], -1.1), hw: 1, hh: 1.5, link: { world: 'X', slot: 'back' } });
  const api = apiFor(A, A2, Bv, C);
  const f = advance('X', [0, 1, 0.5], [0, 1, -0.5], api);
  assert.equal(f.world, 'Y'); assert.equal(f.crossings.length, 1);
  const b = advance('X', [0, 1, -0.5], [0, 1, 0.5], api);
  assert.equal(b.world, 'Z'); assert.equal(b.crossings.length, 1);
  // Return paths: walking back out of Y lands in front of A, not in Z.
  const back = advance('Y', f.p, madd(f.p, Bv.n, -1), api);
  assert.equal(back.world, 'X');
  assert.ok(toLocal(A, back.p)[2] > 0);
  // A step that ends exactly on the shared plane after arriving does not chain into the twin.
  const exact = advance('X', [0, 1, 0.5], [0, 1, 0], api);
  assert.equal(exact.crossings.length, 0, 'z = 0 is still the front of A');
});

test('cyclic portals in one world (a looping corridor) terminate at the crossing cap', () => {
  // Corridor along +X: the far end (x = 10, facing -X) continues at the start (x = 0, facing +X).
  const end = makePortal({ world: 'X', slot: 'end', p: [10, 1.5, 0], q: qaxis([0, 1, 0], -Math.PI / 2), hw: 1.5, hh: 1.5, link: { world: 'X', slot: 'start' } });
  const start = makePortal({ world: 'X', slot: 'start', p: [0, 1.5, 0], q: qaxis([0, 1, 0], Math.PI / 2), hw: 1.5, hh: 1.5, link: { world: 'X', slot: 'end' } });
  const api = apiFor(end, start);
  const one = advance('X', [9.5, 1.5, 0], [10.5, 1.5, 0], api);
  close(one.p, [0.5, 1.5, 0], 1e-5, 'reappears at the start');
  assert.ok(len(sub(xvec(one.xf, [1, 0, 0]), [1, 0, 0])) < 1e-9, 'same heading');
  const many = advance('X', [1, 1.5, 0], [1000, 1.5, 0], api);
  assert.equal(many.crossings.length, 8, 'bounded by MAX_CROSSINGS');
  // Walking backwards from the start leaves through the start portal's back? No:
  // the start portal faces +X, so walking -X across it from in front crosses into the end.
  const rev = advance('X', [0.5, 1.5, 0], [-0.5, 1.5, 0], api);
  close(rev.p, [9.5, 1.5, 0], 1e-5, 'walking back from the start emerges at the far end');
});

test('rays continue through portals and report the world they hit', () => {
  const A = makePortal({ world: 'X', slot: 'a', p: [0, 0, -5], q: [0, 0, 0, 1], hw: 1, hh: 1, link: { world: 'Y', slot: 'b' } });
  const B = makePortal({ world: 'Y', slot: 'b', p: [100, 0, 0], q: qaxis([0, 1, 0], Math.PI / 2), hw: 1, hh: 1, link: { world: 'X', slot: 'a' } });
  const api = { ...apiFor(A, B), hit: (w, o, d, maxT) => {
    if (w !== 'Y') return null; // a wall in Y at x = 107
    if (d[0] <= 0) return null; const t = (107 - o[0]) / d[0];
    return t >= 0 && t <= maxT ? { t, p: madd(o, d, t) } : null;
  } };
  const h = castRay('X', [0, 0, 0], [0, 0, -1], 100, api);
  assert.ok(h); assert.equal(h.world, 'Y');
  assert.ok(Math.abs(h.t - 12) < 1e-5, `total distance 5 + 7, got ${h.t}`);
  assert.equal(h.path.length, 2);
});

test('polygon clipping and the near-zone test', () => {
  const sq = [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]];
  const half = clipPolygon(sq, [1, 0, 0], 0);
  assert.equal(half.length, 4); assert.ok(half.every((p) => p[0] >= -1e-12));
  assert.equal(clipPolygon(sq, [1, 0, 0], -2).length, 0);
  const A = makePortal({ world: 'X', slot: 'a', p: [0, 0, 0], q: [0, 0, 0, 1], hw: 1, hh: 2 });
  assert.ok(cameraInNearZone(A, [0, 1, 0.1], 0.3));
  assert.ok(!cameraInNearZone(A, [0, 1, 0.5], 0.3));
  assert.ok(!cameraInNearZone(A, [1.2, 1, 0.1], 0.3));
  assert.ok(!cameraInNearZone(A, [0, 1, -0.01], 0.3));
  assert.ok(Math.abs(dot(A.n, [0, 0, 1]) - 1) < 1e-12);
});
