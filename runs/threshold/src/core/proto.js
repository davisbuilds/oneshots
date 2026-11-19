// Prototype worlds used to prove the portal engine before the multiverse
// existed: two simple spaces, a doorway between them, a pair of facing
// portals (a mirror-like infinite regress) and a back-to-back gate.
// Kept for the physics tests and as a diagnostic scene (in the browser
// console: THR.place("proto:A", [0, 0, 6], 0)).
import { makePortal } from './portal.js';
import { frameParts, portalPose } from './frames.js';
import { xyaw, qaxis } from './math.js';

const base = (o) => ({
  materials: {
    threshold: { color: [0.32, 0.30, 0.28], rough: 0.85 },
    thresholdGlow: { color: [0.1, 0.1, 0.1], emissive: [1.0, 0.75, 0.4], emissiveIntensity: 4 },
    ground: { color: o.ground, rough: 0.95 },
    a: { color: o.a, rough: 0.6 }, b: { color: o.b, rough: 0.4, metal: 0.2 },
  },
  light: { sun: 3, hemi: 0.6, hemiSky: o.hemiSky, hemiGround: o.hemiGround, env: 0.6, shadows: true },
  ground: { kind: 'plane', y: 0, mat: 'ground' },
});

function door(world, slot, floor, yaw, hw, hh, link, style) {
  const pose = portalPose(floor, yaw, hh);
  return makePortal({ world, slot, p: pose.p, q: pose.q, hw, hh, link, style });
}

export function protoWorld(key) {
  if (key === 'proto:A') {
    const portals = [
      door(key, 'toB', [0, 0, -14], 0, 1.6, 2.4, { world: 'proto:B', slot: 'toA' }, 'monolith'),
      door(key, 'm1', [-14, 0, 0], -Math.PI / 2, 1.4, 2.2, { world: key, slot: 'm2' }, 'gate'),
      door(key, 'm2', [-26, 0, 0], Math.PI / 2, 1.4, 2.2, { world: key, slot: 'm1' }, 'gate'),
      door(key, 'bf', [14, 0, -6], Math.PI / 2, 1.2, 2.0, { world: 'proto:B', slot: 'bb1' }, 'gate'),
      door(key, 'bb', [14, 0, -6], -Math.PI / 2, 1.2, 2.0, { world: 'proto:B', slot: 'bb2' }, 'gate'),
    ];
    const parts = [];
    for (const P of portals) if (P.slot !== 'bb') parts.push(...frameParts(P, P.style));
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, r = 30 + (i % 3) * 6;
      parts.push({ kind: 'box', xf: xyaw([Math.cos(a) * r, 3 + (i % 4), Math.sin(a) * r], a), he: [1.2, 3 + (i % 4), 1.2], mat: i % 2 ? 'a' : 'b', solid: true });
    }
    parts.push({ kind: 'box', xf: xyaw([4, 0.5, -4], 0.3), he: [1, 0.5, 1], mat: 'b', solid: true });
    return {
      key, name: 'Proto A', ...base({ ground: [0.22, 0.24, 0.27], a: [0.5, 0.55, 0.6], b: [0.2, 0.35, 0.5], hemiSky: [0.5, 0.6, 0.8], hemiGround: [0.15, 0.15, 0.18] }),
      atmos: { fogColor: [0.45, 0.52, 0.62], sunDir: [-0.4, 0.35, -0.6], sunColor: [1.0, 0.85, 0.7], fogDensity: 0.008, fogFalloff: 0.02, fogBase: 0, inscatter: 0.6 },
      sky: { zenith: [0.12, 0.22, 0.42], horizon: [0.55, 0.62, 0.72], ground: [0.2, 0.22, 0.25], sunSize: 0.012, sunGlow: 1.5, sunDisc: 30, moons: [], stars: 0, aurora: 0, clouds: 0.45, cloudScale: 0.6, cloudColor: [0.8, 0.82, 0.88] },
      fill: [0.45, 0.52, 0.62], portals, parts, spawn: { p: [0, 0, 6], yaw: 0 },
    };
  }
  if (key === 'proto:B') {
    const portals = [
      door(key, 'toA', [24, 0, 4], -Math.PI / 2, 1.6, 2.4, { world: 'proto:A', slot: 'toB' }, 'monolith'),
      door(key, 'bb1', [0, 0, 30], Math.PI, 1.2, 2.0, { world: 'proto:A', slot: 'bf' }, 'gate'),
      door(key, 'bb2', [-30, 0, 0], Math.PI / 2, 1.2, 2.0, { world: 'proto:A', slot: 'bb' }, 'gate'),
    ];
    const parts = [];
    for (const P of portals) parts.push(...frameParts(P, P.style));
    for (let i = 0; i < 20; i++) {
      const a = i * 2.39996, r = 8 + i * 2.2;
      parts.push({ kind: 'cyl', xf: xyaw([Math.cos(a) * r, 4, Math.sin(a) * r], 0), r: 0.8, h: 8, mat: i % 2 ? 'a' : 'b', solid: true });
    }
    return {
      key, name: 'Proto B', ...base({ ground: [0.55, 0.36, 0.2], a: [0.8, 0.5, 0.3], b: [0.6, 0.2, 0.15], hemiSky: [0.9, 0.6, 0.4], hemiGround: [0.3, 0.18, 0.1] }),
      atmos: { fogColor: [0.85, 0.5, 0.3], sunDir: [0.5, 0.25, 0.3], sunColor: [1.0, 0.6, 0.35], fogDensity: 0.012, fogFalloff: 0.03, fogBase: 0, inscatter: 0.9 },
      sky: { zenith: [0.25, 0.12, 0.2], horizon: [0.95, 0.55, 0.32], ground: [0.4, 0.25, 0.15], sunSize: 0.03, sunGlow: 2, sunDisc: 20, moons: [{ dir: [-0.4, 0.5, -0.6], size: 0.06, color: [0.9, 0.85, 0.8] }, { dir: [0.2, 0.3, -0.8], size: 0.03, color: [0.7, 0.8, 1.0] }], stars: 0.5, aurora: 0, clouds: 0.25, cloudScale: 0.5, cloudColor: [0.9, 0.6, 0.45] },
      fill: [0.85, 0.5, 0.3], portals, parts, spawn: { p: [18, 0, 4], yaw: Math.PI / 2 },
    };
  }
  return null;
}
