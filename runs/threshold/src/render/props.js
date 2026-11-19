// Procedural props and their instanced rendering. Geometry is built per
// variant from a seed; placements come from the core scatter cache, the same
// one physics uses, so every rock you can see is a rock you can walk into.
import * as THREE from 'three';
import { rng, hash32 } from '../core/rng.js';
import { CHUNK } from '../core/scatter.js';
import { LAYER } from './portal-renderer.js';

// 3D value noise for displacement.
function vnoise3(x, y, z, s) {
  const h = (i, j, k) => (hash32(i, j, k, s) >>> 8) / 16777216;
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(ix, iy, iz), h(ix + 1, iy, iz), u), l(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), u), v),
    l(l(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), u), l(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), u), v), w);
}
const fbm3 = (x, y, z, s) => vnoise3(x, y, z, s) * 0.6 + vnoise3(x * 2.1, y * 2.1, z * 2.1, s + 1) * 0.3 + vnoise3(x * 4.3, y * 4.3, z * 4.3, s + 2) * 0.1;

function finalize(g) { g.computeVertexNormals(); g.computeBoundingSphere(); return g; }
function mergeSimple(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3); let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return finalize(out);
}

export function rockGeo(v, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position, s = 977 + v * 31;
  const sq = 0.55 + (v % 3) * 0.12;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 0.72 + fbm3(x * 1.4 + v, y * 1.4, z * 1.4, s) * 0.62;
    let ny = y * d * sq;
    if (ny < -0.15) ny = -0.15 + (ny + 0.15) * 0.3; // flattened underside
    p.setXYZ(i, x * d * (1 + (v % 2) * 0.25), ny, z * d);
  }
  return finalize(g);
}

export function spireGeo(v) {
  const R = rng(4441 + v);
  const pts = [];
  const H = 9, tw = R.range(0.6, 1.6);
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    pts.push(new THREE.Vector2(Math.max(0.03, 0.95 * Math.pow(1 - t, 1.5) + 0.05 * Math.sin(t * 20 + v)), t * H - 0.8));
  }
  const g = new THREE.LatheGeometry(pts, 7);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = (y + 0.8) / H;
    const a = t * tw, c = Math.cos(a), s = Math.sin(a);
    const bend = t * t * R.range(0.5, 1.5);
    p.setXYZ(i, x * c - z * s + bend, y, x * s + z * c);
  }
  return finalize(g);
}

export function shardGeo(v) {
  const R = rng(733 + v), list = [];
  const n = 2 + R.int(3);
  for (let k = 0; k < n; k++) {
    const h = R.range(1.2, 3.2), r = R.range(0.18, 0.4);
    const body = new THREE.CylinderGeometry(r, r * 1.1, h, 6, 1);
    const tip = new THREE.ConeGeometry(r, r * 2.2, 6); tip.translate(0, h / 2 + r * 1.1, 0);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(R.range(-0.45, 0.45), R.range(0, 6), R.range(-0.45, 0.45)));
    m.setPosition(R.range(-0.5, 0.5), h / 2 - 0.3, R.range(-0.5, 0.5));
    body.applyMatrix4(m); tip.applyMatrix4(m);
    list.push(body, tip);
  }
  return mergeSimple(list);
}

// A lumen tree: a tall flared trunk, a few branches carrying glowing caps,
// and luminous strands hanging under the caps. Returns { trunk, caps }.
export function lumenTreeGeo(v, scale = 1) {
  const R = rng(9001 + v);
  const H = 20 * scale, bend = R.range(-1.2, 1.2);
  const prof = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const r = (0.55 + 1.6 * Math.exp(-t * 14) + 0.25 * (1 - t)) * scale * (1 - t * 0.55);
    prof.push(new THREE.Vector2(r, t * H - 0.6));
  }
  const trunk = new THREE.LatheGeometry(prof, 12);
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i), t = Math.max(0, y / H);
    const ang = Math.atan2(tp.getZ(i), tp.getX(i));
    const root = Math.exp(-t * 18) * (0.6 + 0.4 * Math.sin(ang * 5 + v)) * 1.4 * scale;
    const rr = Math.hypot(tp.getX(i), tp.getZ(i)) + root;
    tp.setXYZ(i, Math.cos(ang) * rr + bend * t * t * 3, y, Math.sin(ang) * rr);
  }
  const parts = [trunk], caps = [];
  const nCaps = 3 + R.int(3);
  for (let k = 0; k < nCaps; k++) {
    const t = R.range(0.55, 0.97), a = R.range(0, Math.PI * 2) + k * 2.1;
    const len = R.range(1.5, 4.5) * scale * (1.1 - t * 0.5);
    const base = new THREE.Vector3(bend * t * t * 3, t * H, 0);
    const tip = base.clone().add(new THREE.Vector3(Math.cos(a) * len, len * 0.55, Math.sin(a) * len));
    const br = new THREE.CylinderGeometry(0.12 * scale, 0.22 * scale, base.distanceTo(tip), 5, 1);
    br.translate(0, base.distanceTo(tip) / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().sub(base).normalize());
    br.applyQuaternion(q); br.translate(base.x, base.y, base.z);
    parts.push(br);
    const cr = R.range(2.2, 4.6) * scale * (1.15 - t * 0.4);
    const cap = new THREE.CylinderGeometry(cr * 0.18, cr, cr * 0.32, 14, 1, true);
    cap.translate(tip.x, tip.y + cr * 0.05, tip.z);
    caps.push(cap);
    const under = new THREE.CircleGeometry(cr * 0.97, 14).rotateX(Math.PI / 2);
    under.translate(tip.x, tip.y - cr * 0.11, tip.z);
    caps.push(under);
    // hanging strands
    for (let s = 0; s < 6; s++) {
      const sa = R.range(0, Math.PI * 2), sr = R.range(0.3, 0.9) * cr, sl = R.range(1.5, 4.5) * scale;
      const strand = new THREE.PlaneGeometry(0.05 * scale, sl);
      strand.translate(0, -sl / 2, 0);
      strand.rotateY(sa);
      strand.translate(tip.x + Math.cos(sa) * sr, tip.y - cr * 0.12, tip.z + Math.sin(sa) * sr);
      caps.push(strand);
    }
  }
  return { trunk: mergeSimple(parts), caps: mergeSimple(caps) };
}

export function fungusGeo(v) {
  const R = rng(1201 + v), list = [];
  const n = 3 + R.int(4);
  for (let k = 0; k < n; k++) {
    const h = R.range(0.15, 0.7), r = R.range(0.06, 0.22), x = R.range(-0.35, 0.35), z = R.range(-0.35, 0.35);
    const stem = new THREE.CylinderGeometry(r * 0.25, r * 0.35, h, 5); stem.translate(x, h / 2, z);
    const cap = new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.55, 1); cap.translate(x, h, z);
    list.push(stem, cap);
  }
  return mergeSimple(list);
}

export function reedGeo(v) {
  const R = rng(3301 + v), list = [];
  const n = 5 + R.int(5);
  for (let k = 0; k < n; k++) {
    const h = R.range(0.5, 1.6), a = R.range(0, Math.PI * 2), lean = R.range(-0.25, 0.25);
    const blade = new THREE.PlaneGeometry(0.035, h, 1, 3);
    const p = blade.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + h / 2) / h; p.setX(i, p.getX(i) * (1 - t * 0.8) + lean * t * t); }
    blade.translate(0, h / 2, 0); blade.rotateY(a); blade.translate(R.range(-0.3, 0.3), 0, R.range(-0.3, 0.3));
    list.push(blade);
  }
  return mergeSimple(list);
}

const BUILD = {
  rock: (v) => [{ geo: rockGeo(v), mat: 'mat' }],
  spire: (v) => [{ geo: spireGeo(v), mat: 'mat' }],
  shard: (v) => [{ geo: shardGeo(v), mat: 'mat' }],
  lumentree: (v) => { const t = lumenTreeGeo(v); return [{ geo: t.trunk, mat: 'mat', shadow: true }, { geo: t.caps, mat: v % 2 ? 'capMatB' : 'capMat', double: true }]; },
  fungus: (v) => [{ geo: fungusGeo(v), mat: 'mat' }],
  reed: (v) => [{ geo: reedGeo(v), mat: 'mat', double: true }],
};
const RADIUS = { rock: 300, spire: 900, shard: 320, lumentree: 240, fungus: 55, reed: 45 };

// Instanced rendering of one world's scatter specs around a focus point.
export class ScatterRender {
  constructor(view, cache) {
    this.view = view; this.cache = cache; this.group = new THREE.Group(); this.group.name = 'scatter';
    this.sets = [];
    for (const spec of view.desc.scatter) {
      const radius = RADIUS[spec.kind] || 200;
      const variants = [];
      for (let v = 0; v < (spec.variants || 1); v++) {
        const pieces = BUILD[spec.kind](v).map((pc) => {
          const matName = spec[pc.mat] || spec.mat;
          const mat = view.materialFor(matName, pc.double);
          const cap = Math.ceil(Math.PI * radius * radius / (spec.cell * spec.cell) * spec.prob / (spec.variants || 1) * 1.6) + 16;
          const mesh = new THREE.InstancedMesh(pc.geo, mat, cap);
          mesh.count = 0; mesh.castShadow = !!pc.shadow || spec.kind === 'rock' || spec.kind === 'spire'; mesh.receiveShadow = true;
          mesh.frustumCulled = true;
          if (spec.detail) mesh.layers.set(LAYER.DETAIL);
          view.track(pc.geo);
          this.group.add(mesh);
          return mesh;
        });
        variants.push(pieces);
      }
      this.sets.push({ spec, radius, variants });
    }
    this.last = null;
    this.count = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._y = new THREE.Vector3(0, 1, 0);
  }

  update(focus) {
    if (this.last && Math.hypot(focus.x - this.last[0], focus.z - this.last[1]) < 14) return;
    this.last = [focus.x, focus.z];
    this.count = 0;
    for (const set of this.sets) {
      const { spec, radius, variants } = set;
      const fill = variants.map(() => 0);
      const x0 = Math.floor((focus.x - radius) / CHUNK), x1 = Math.floor((focus.x + radius) / CHUNK);
      const z0 = Math.floor((focus.z - radius) / CHUNK), z1 = Math.floor((focus.z + radius) / CHUNK);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        for (const o of this.cache.get(spec, cx, cz)) {
          if (Math.hypot(o.x - focus.x, o.z - focus.z) > radius) continue;
          const pieces = variants[o.v % variants.length], i = fill[o.v % variants.length];
          if (i >= pieces[0].instanceMatrix.count) continue;
          this._q.setFromAxisAngle(this._y, o.yaw);
          this._m.compose(this._p.set(o.x, o.y, o.z), this._q, this._s.set(o.s, o.s, o.s));
          for (const m of pieces) m.setMatrixAt(i, this._m);
          fill[o.v % variants.length] = i + 1;
        }
      }
      variants.forEach((pieces, k) => { for (const m of pieces) { m.count = fill[k]; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); } this.count += fill[k]; });
    }
  }

  dispose() { for (const s of this.sets) for (const v of s.variants) for (const m of v) m.dispose(); this.group.clear(); }
}
