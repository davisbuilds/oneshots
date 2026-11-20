// Chunked, deterministic placement of natural objects (rocks, trees, fungi,
// crystals...). A world is divided into CHUNK-metre squares; each chunk is
// divided into cells of `cell` metres and each cell holds at most one object,
// decided by a hash of (seed, kind, cell). The same function serves physics
// (colliders near the traveller) and rendering (instances per chunk), so what
// you see is what you bump into, and both are reproducible from the seed.
import { hash32, unit } from './rng.js';
import { capsuleCollider, boxCollider } from './physics.js';
import { xyaw } from './math.js';

export const CHUNK = 64;

// spec: { kind, cell, prob, scale: [a, b], mask(x, z) -> 0..1, clear: metres
//         from sites, collide: { r, h } (relative to scale) or null, variants }
export function scatterChunk(desc, spec, cx, cz) {
  const out = [];
  const n = Math.round(CHUNK / spec.cell), seed = hash32(desc.seed, spec.id || 0);
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    const gx = cx * n + a, gz = cz * n + b;
    const h = hash32(gx, gz, seed);
    const r0 = unit(h), r1 = unit(hash32(h, 1)), r2 = unit(hash32(h, 2)), r3 = unit(hash32(h, 3)), r4 = unit(hash32(h, 4));
    const x = (gx + 0.15 + r1 * 0.7) * spec.cell, z = (gz + 0.15 + r2 * 0.7) * spec.cell;
    let p = spec.prob;
    if (spec.mask) p *= spec.mask(x, z);
    if (r0 >= p) continue;
    if (spec.clear && desc.clearance && desc.clearance(x, z) < spec.clear) continue;
    const y = spec.ceiling ? desc.ceilingAt(x, z) : desc.heightAt ? desc.heightAt(x, z) : 0;
    const s = spec.scale[0] + (spec.scale[1] - spec.scale[0]) * r3 * r3;
    out.push({ x, y, z, yaw: r4 * Math.PI * 2, s, v: hash32(h, 5) % (spec.variants || 1), h: unit(hash32(h, 6)) });
  }
  return out;
}

// A bounded cache of chunk placements (LRU), shared by physics and rendering.
export class ScatterCache {
  constructor(desc, capacity = 256) { this.desc = desc; this.capacity = capacity; this.map = new Map(); this.builds = 0; }
  get(spec, cx, cz) {
    const k = `${spec.id}:${cx}:${cz}`;
    let v = this.map.get(k);
    if (v) { this.map.delete(k); this.map.set(k, v); return v; }
    v = scatterChunk(this.desc, spec, cx, cz); this.builds++;
    this.map.set(k, v);
    while (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value);
    return v;
  }
  // Colliders for scattered objects near c (radius r), appended to out.
  colliders(c, r, out) {
    for (const spec of this.desc.scatter) {
      if (!spec.collide) continue;
      const m = spec.reach || 8;
      const x0 = Math.floor((c[0] - r - m) / CHUNK), x1 = Math.floor((c[0] + r + m) / CHUNK);
      const z0 = Math.floor((c[2] - r - m) / CHUNK), z1 = Math.floor((c[2] + r + m) / CHUNK);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        for (const o of this.get(spec, cx, cz)) {
          if (spec.collide.box) {
            const b = spec.collide.box[o.v % spec.collide.box.length];
            const he = [b[0] * o.s, b[1] * o.s, b[2] * o.s];
            if (Math.abs(o.x - c[0]) > r + Math.hypot(he[0], he[2]) + 1 || Math.abs(o.z - c[2]) > r + Math.hypot(he[0], he[2]) + 1) continue;
            out.push(boxCollider(xyaw([o.x, o.y + he[1] + (b[3] || 0) * o.s, o.z], o.yaw), he));
            continue;
          }
          const rr = spec.collide.r * o.s;
          if (Math.abs(o.x - c[0]) > r + rr + 1 || Math.abs(o.z - c[2]) > r + rr + 1) continue;
          const h = spec.collide.h * o.s, y0 = o.y + (spec.collide.y0 || 0) * o.s;
          out.push(capsuleCollider([o.x, y0 + rr, o.z], [o.x, y0 + Math.max(rr, h - rr), o.z], rr));
        }
      }
    }
    return out;
  }
}
