// Quadtree terrain streamed around a focus point. Root tiles of ROOT metres
// tile the plane around the focus; a tile splits while the focus is closer
// than SPLIT × its size, down to MIN metres. Every leaf is a 32×32 grid with
// skirts that hide cracks between levels. Tiles are cached (LRU, bounded) and
// built under a per-frame time budget; the previous selection stays on screen
// until the new one is complete, so there are never holes.
import * as THREE from 'three';

const ROOT = 1024, MIN = 64, SPLIT = 1.35, N = 32, ROOTS = 1, CAPACITY = 160;

export class Terrain {
  constructor(heightAt, material, { castShadow = false } = {}) {
    this.h = heightAt;
    this.material = material;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.cache = new Map();
    this.shown = new Set();
    this.castShadow = castShadow;
    this.stats = { tiles: 0, built: 0, evicted: 0, pending: 0 };
    this.lastFocus = null;
  }

  // Leaves required for a focus point.
  select(fx, fz) {
    const out = [];
    const cx = Math.floor(fx / ROOT), cz = Math.floor(fz / ROOT);
    const visit = (x, z, size) => {
      const mx = x + size / 2, mz = z + size / 2;
      const d = Math.max(Math.abs(fx - mx) - size / 2, Math.abs(fz - mz) - size / 2, 0);
      if (size > MIN && d < size * SPLIT) {
        const s = size / 2;
        visit(x, z, s); visit(x + s, z, s); visit(x, z + s, s); visit(x + s, z + s, s);
      } else out.push(`${x}:${z}:${size}`);
    };
    for (let i = -ROOTS; i <= ROOTS; i++) for (let j = -ROOTS; j <= ROOTS; j++) visit((cx + i) * ROOT, (cz + j) * ROOT, ROOT);
    return out;
  }

  build(key) {
    const [x0, z0, size] = key.split(':').map(Number);
    const step = size / N, V = N + 1;
    // heights with a one-sample border for normals
    const H = new Float32Array((V + 2) * (V + 2));
    for (let j = -1; j <= V; j++) for (let i = -1; i <= V; i++) H[(j + 1) * (V + 2) + (i + 1)] = this.h(x0 + i * step, z0 + j * step);
    const hv = (i, j) => H[(j + 1) * (V + 2) + (i + 1)];
    const skirt = Math.max(2, step * 1.5);
    const nv = V * V + 4 * V;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
    let k = 0;
    const put = (x, y, z, i, j) => {
      const nx = hv(i - 1, j) - hv(i + 1, j), nz = hv(i, j - 1) - hv(i, j + 1), ny = 2 * step;
      const l = Math.hypot(nx, ny, nz);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
      return k++;
    };
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) put(x0 + i * step, hv(i, j), z0 + j * step, i, j);
    const idx = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    // skirts: one ring of vertices dropped below each edge
    const edge = (list) => {
      const base = k;
      for (const [i, j] of list) put(x0 + i * step, hv(i, j) - skirt, z0 + j * step, i, j);
      for (let t = 0; t + 1 < list.length; t++) {
        const [i0, j0] = list[t], [i1, j1] = list[t + 1];
        const a = j0 * V + i0, b = j1 * V + i1, c = base + t, d = base + t + 1;
        idx.push(a, b, c, b, d, c, a, c, b, b, c, d);
      }
    };
    const row = (fn) => Array.from({ length: V }, (_, t) => fn(t));
    edge(row((t) => [t, 0])); edge(row((t) => [t, N])); edge(row((t) => [0, t])); edge(row((t) => [N, t]));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, k * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, k * 3), 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.material);
    m.matrixAutoUpdate = false; m.receiveShadow = true; m.castShadow = this.castShadow && size <= 128;
    this.stats.built++;
    return m;
  }

  // Bring the selection up to date within `budgetMs`. Returns true when the
  // shown set matches the required set.
  update(focus, budgetMs = 4) {
    const fx = focus.x, fz = focus.z;
    if (this.lastFocus && Math.hypot(fx - this.lastFocus[0], fz - this.lastFocus[1]) < 8 && !this.pending) return true;
    const need = this.pending || this.select(fx, fz);
    const t0 = performance.now();
    let missing = 0;
    for (const key of need) {
      if (this.cache.has(key)) continue;
      if (performance.now() - t0 > budgetMs) { missing++; continue; }
      this.cache.set(key, this.build(key));
    }
    this.stats.pending = missing;
    if (missing) { this.pending = need; return false; }
    this.pending = null;
    this.lastFocus = [fx, fz];
    // swap the shown set
    const want = new Set(need);
    for (const key of this.shown) if (!want.has(key)) this.group.remove(this.cache.get(key));
    for (const key of want) if (!this.shown.has(key)) { const m = this.cache.get(key); this.cache.delete(key); this.cache.set(key, m); this.group.add(m); }
    this.shown = want;
    // evict least-recently-used tiles that are not shown
    for (const [key, m] of this.cache) {
      if (this.cache.size <= CAPACITY) break;
      if (this.shown.has(key)) continue;
      m.geometry.dispose(); this.cache.delete(key); this.stats.evicted++;
    }
    this.stats.tiles = this.cache.size;
    return true;
  }

  dispose() {
    for (const m of this.cache.values()) m.geometry.dispose();
    this.cache.clear(); this.shown.clear(); this.group.clear();
  }
}
