// Shared tools for world generators: colour, doorway sites, flattened terrain
// around sites, and the descriptor skeleton every archetype fills in.
import { makePortal } from './portal.js';
import { frameParts, portalPose } from './frames.js';
import { edgeProps } from './multiverse.js';
import { xyaw, xf, qaxis, clamp, smoothstep, mix, norm, sub } from './math.js';
import { collidersFromParts, heightField } from './space.js';
import { capsuleCollider } from './physics.js';
import { ScatterCache } from './scatter.js';

// HSL (degrees, 0..1, 0..1) to linear RGB.
export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); };
  return [f(0), f(8), f(4)].map((c) => Math.pow(c, 2.2));
}
export const scaleRGB = (c, k) => c.map((x) => x * k);
export const mixRGB = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

// Lattice slot -> bearing in the world (radians, 0 = north = -Z, clockwise).
export const BEARING = { N: 0, E: Math.PI / 2, S: Math.PI, W: -Math.PI / 2, L0: 0.9, L1: -0.7, L2: 2.3, L3: -2.4, l0: -2.25, l1: 2.45, l2: -0.85, l3: 0.75 };
export const bearingVec = (b) => [Math.sin(b), 0, -Math.cos(b)];
// yaw for a portal at `p` whose front faces point `target`
export function faceYaw(p, target) { const d = sub(target, p); return Math.atan2(d[0], d[2]); }

export function skeleton(ctx) {
  return {
    key: ctx.key, coord: [ctx.i, ctx.j], pocket: ctx.pocket, seed: ctx.seed, archetype: ctx.archetype,
    name: ctx.name, epithet: '', parts: [], features: [], portals: [], landmarks: [], lights: [],
    materials: {
      threshold: { color: [0.42, 0.40, 0.37], rough: 0.82, detail: 'stone' },
      thresholdGlow: { color: [0.05, 0.05, 0.05], emissive: [1.0, 0.78, 0.5], emissiveIntensity: 5, castShadow: false },
    },
    sites: [],          // flattened, cleared areas: { p, r, y, blend }
    scatter: [],
    gravity: [0, -16, 0],
    killHeight: -200,
    post: { exposure: 1, saturation: 1.05, contrast: 1.04, lift: [0, 0, 0], gain: [1, 1, 1], bloom: 0.5 },
    audio: { base: 'wind', tone: 220, wind: 0.4 },
  };
}

// Place a doorway for a link at a floor point, facing `faceTo`.
export function addDoor(desc, link, floor, faceTo, opts = {}) {
  const props = opts.props || edgeProps(link.edge);
  const yaw = opts.yaw ?? faceYaw(floor, faceTo);
  const pose = portalPose(floor, yaw, props.hh);
  const P = makePortal({ world: desc.key, slot: link.slot, p: pose.p, q: pose.q, hw: props.hw, hh: props.hh, link: link.to, style: props.style, great: props.great || false });
  desc.portals.push(P);
  if (!opts.noFrame) desc.parts.push(...frameParts(P, opts.style || props.style, opts));
  desc.sites.push({ p: floor, r: opts.siteR ?? Math.max(9, props.hw * 3), y: floor[1], blend: opts.blend ?? 14, door: P.id });
  return P;
}

// Wrap a base height function so sites are flat plateaus that blend smoothly.
export function withSites(base, sites) {
  return (x, z) => {
    let h = base(x, z);
    for (const s of sites) {
      const d = Math.hypot(x - s.p[0], z - s.p[2]);
      if (d < s.r + s.blend) {
        const t = smoothstep(s.r + s.blend, s.r, d);
        h = mix(h, s.y - 0.02, t);
      }
    }
    return h;
  };
}

// Distance to the nearest site (for keeping scatter off paths and plazas).
export function siteClearance(sites, x, z) {
  let m = Infinity;
  for (const s of sites) m = Math.min(m, Math.hypot(x - s.p[0], z - s.p[2]) - s.r);
  return m;
}

// Clearance from the doorways' plazas only (for placing large structures).
export function doorClearance(d, x, z) {
  let m = Infinity;
  for (const s of d.sites) if (s.door) m = Math.min(m, Math.hypot(x - s.p[0], z - s.p[2]) - s.r);
  return m;
}

// Distance from point to a polyline path (list of [x, z]).
export function pathDistance(path, x, z) {
  let m = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = L > 0 ? clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1) : 0;
    m = Math.min(m, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return m;
}

// Turn a bearing until a doorway placed along it at `dist` is at least `gap`
// metres from every doorway already placed (so doors never stand in front of
// each other).
export function spreadBearing(d, b, dist, center = [0, 0, 0], gap = 24) {
  for (let k = 0; k < 16; k++) {
    const v = bearingVec(b), x = center[0] + v[0] * dist, z = center[2] + v[2] * dist;
    if (d.portals.every((P) => Math.hypot(P.xf.p[0] - x, P.xf.p[2] - z) >= gap + P.hw)) return b;
    b += 0.37;
  }
  return b;
}

// Place doorways for every lattice link around a centre, arrival (W) near it,
// others further out along their bearings. yAt gives the floor height.
export function ringDoors(d, ctx, R, yAt, { near = 30, far = [90, 160], jitter = 0.3, center = [0, 0, 0], siteR = 8, blend = 14, lift = 0.4 } = {}) {
  for (const link of ctx.links) {
    const dist = link.slot === 'W' ? near : R.range(far[0], far[1]);
    const b = spreadBearing(d, (BEARING[link.slot] ?? R.range(-Math.PI, Math.PI)) + R.range(-jitter, jitter), dist, center);
    const v = bearingVec(b);
    const x = center[0] + v[0] * dist, z = center[2] + v[2] * dist;
    addDoor(d, link, [x, yAt(x, z) + lift, z], [center[0], yAt(x, z) + lift, center[2]], { siteR, blend });
  }
}

// Finish a descriptor: terrain, colliders, and the portal plinths.
export function finish(desc, baseHeight) {
  if (baseHeight) {
    const h = withSites(baseHeight, desc.sites);
    desc.terrain = heightField(h);
    desc.heightAt = h;
  }
  if (desc.lodestone) {
    const L = desc.lodestone, yaw = L.yaw || 0;
    desc.parts.push({ kind: 'box', xf: xyaw([L.p[0], L.p[1] + 0.45, L.p[2]], yaw), he: [0.75, 0.45, 0.75], mat: 'threshold', solid: true });
    desc.parts.push({ kind: 'box', xf: xyaw([L.p[0], L.p[1] + 0.92, L.p[2]], yaw), he: [0.6, 0.03, 0.6], mat: 'thresholdGlow', solid: false });
  }
  desc.colliders = collidersFromParts(desc.parts);
  for (const f of desc.features) {
    if (f.type !== 'ring' || !f.solidSegments) continue;
    const pts = [];
    for (let k = 0; k <= 48; k++) {
      const a = (k / 48) * Math.PI * 2, lx = Math.cos(a) * f.r, ly = Math.sin(a) * f.r;
      pts.push([f.p[0] + Math.cos(f.yaw) * lx, f.p[1] + ly, f.p[2] - Math.sin(f.yaw) * lx]);
    }
    for (let k = 0; k < 48; k++) desc.colliders.push(capsuleCollider(pts[k], pts[k + 1], f.tube));
  }
  if (desc.scatter.length) {
    const cache = new ScatterCache(desc);
    desc.scatterCache = cache;
    desc.dynamicColliders = (c, r, out) => cache.colliders(c, r, out);
  }
  desc.fill = desc.fill || desc.atmos.fogColor;
  return desc;
}

export { xyaw, xf, qaxis, norm };
