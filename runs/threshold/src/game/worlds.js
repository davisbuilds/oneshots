// Bounded caches for descriptors (pure data, cheap to regenerate) and for
// loaded world views (GPU resources, expensive). The view cache keeps the
// worlds that are needed now and evicts the least recently needed beyond its
// capacity, disposing their GPU resources.
import { WorldView } from '../render/world-view.js';

export class DescCache {
  constructor(describe, capacity = 64) { this.describe = describe; this.capacity = capacity; this.map = new Map(); this.generated = 0; }
  get(key) {
    let d = this.map.get(key);
    if (d) { this.map.delete(key); this.map.set(key, d); return d; }
    d = this.describe(key);
    if (!d) return null;
    this.generated++;
    this.map.set(key, d);
    while (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value);
    return d;
  }
}

export class ViewCache {
  constructor(ctx, descs, capacity = 6) {
    this.ctx = ctx; this.descs = descs; this.capacity = capacity;
    this.map = new Map();
    this.built = 0; this.disposed = 0; this.lastBuildMs = 0;
    this.onBuild = null;
  }
  get(key) { return this.map.get(key) || null; }
  has(key) { return this.map.has(key); }
  touch(key) { const v = this.map.get(key); if (v) { this.map.delete(key); this.map.set(key, v); } return v; }
  build(key) {
    if (this.map.has(key)) return this.touch(key);
    const d = this.descs.get(key);
    if (!d) return null;
    const t0 = performance.now();
    const v = new WorldView(d, this.ctx).build();
    this.lastBuildMs = performance.now() - t0;
    this.built++;
    this.map.set(key, v);
    this.onBuild?.(v, this.lastBuildMs);
    return v;
  }
  // Keep `keep` (a Set of keys); evict others beyond capacity, oldest first.
  trim(keep) {
    for (const [k, v] of this.map) {
      if (this.map.size <= this.capacity) break;
      if (keep.has(k)) continue;
      v.dispose(); this.map.delete(k); this.disposed++;
    }
  }
  disposeAll() { for (const v of this.map.values()) v.dispose(); this.map.clear(); }
}
