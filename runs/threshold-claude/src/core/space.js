// Space: the physical side of the multiverse. Given a function that produces a
// world descriptor for an address, it serves what physics and traversal need
// (portals and their links, colliders through a broadphase grid, terrain,
// gravity) and keeps a bounded cache of the worlds it has indexed.
import { boxCollider, capsuleCollider } from './physics.js';
import { xpoint, len, sub, norm } from './math.js';
import { makePortal } from './portal.js';

const CELL = 16;

export function collidersFromParts(parts) {
  const out = [];
  for (const p of parts) {
    if (!p.solid) continue;
    if (p.kind === 'box') out.push(boxCollider(p.xf, p.he));
    else if (p.kind === 'cyl' || p.kind === 'cone') {
      const r = p.kind === 'cone' ? p.r * 0.5 : Math.max(p.r, p.r1 ?? p.r);
      const h = p.h / 2, c = Math.min(r, h);
      out.push(capsuleCollider(xpoint(p.xf, [0, -h + c, 0]), xpoint(p.xf, [0, h - c, 0]), r));
    } else if (p.kind === 'sphere' || p.kind === 'ico') out.push({ kind: 'sphere', c: p.xf.p, rad: p.r * (p.kind === 'ico' ? 0.9 : 1), r: p.r });
  }
  return out;
}

class Grid {
  constructor(colliders) {
    this.cells = new Map(); this.large = [];
    for (const c of colliders) {
      const r = c.r;
      if (r > CELL * 4) { this.large.push(c); continue; }
      const x0 = Math.floor((c.c[0] - r) / CELL), x1 = Math.floor((c.c[0] + r) / CELL);
      const z0 = Math.floor((c.c[2] - r) / CELL), z1 = Math.floor((c.c[2] + r) / CELL);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = x * 73856093 ^ z * 19349663;
        let a = this.cells.get(k); if (!a) this.cells.set(k, a = []); a.push(c);
      }
    }
  }
  query(c, r, out) {
    const x0 = Math.floor((c[0] - r) / CELL), x1 = Math.floor((c[0] + r) / CELL);
    const z0 = Math.floor((c[2] - r) / CELL), z1 = Math.floor((c[2] + r) / CELL);
    const seen = new Set();
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const a = this.cells.get(x * 73856093 ^ z * 19349663);
      if (a) for (const k of a) if (!seen.has(k)) { seen.add(k); out.push(k); }
    }
    for (const k of this.large) out.push(k);
    return out;
  }
}

export class Space {
  constructor(describe, { capacity = 24 } = {}) {
    this.describe = describe;
    this.capacity = capacity;
    this.cache = new Map();   // key -> entry, in LRU order
    this.loads = 0; this.evictions = 0;
  }

  entry(key) {
    let e = this.cache.get(key);
    if (e) { this.cache.delete(key); this.cache.set(key, e); return e; }
    const desc = this.describe(key);
    if (!desc) return null;
    const portals = desc.portals.map((P) => (P.inv ? P : makePortal(P)));
    e = {
      desc, portals,
      bySlot: new Map(portals.map((P) => [P.slot, P])),
      grid: new Grid(desc.colliders || collidersFromParts(desc.parts || [])),
      terrain: desc.terrain || (desc.ground && desc.ground.kind === 'plane' ? flat(desc.ground.y) : null),
    };
    this.cache.set(key, e); this.loads++;
    while (this.cache.size > this.capacity) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest); this.evictions++;
    }
    return e;
  }

  portals(key) { return this.entry(key)?.portals || []; }
  resolve(P) { return P.link ? this.entry(P.link.world)?.bySlot.get(P.link.slot) || null : null; }
  colliders(key, c, r) {
    const e = this.entry(key); if (!e) return [];
    const out = e.grid.query(c, r, []);
    if (e.desc.dynamicColliders) e.desc.dynamicColliders(c, r, out);
    return out;
  }
  terrain(key) { return this.entry(key)?.terrain || null; }
  gravity(key, p) {
    const d = this.entry(key)?.desc;
    if (d?.gravityAt) return d.gravityAt(p);
    return d?.gravity || [0, -16, 0];
  }
  killHeight(key) { return this.entry(key)?.desc.killHeight ?? null; }
}

function flat(y) {
  return { height: () => y, normal: () => [0, 1, 0] };
}

// Terrain from a height function: normal by central differences.
export function heightField(h, e = 0.5) {
  return {
    height: h,
    normal: (x, z) => norm([h(x - e, z) - h(x + e, z), 2 * e, h(x, z - e) - h(x, z + e)]),
  };
}
export { len, sub };
