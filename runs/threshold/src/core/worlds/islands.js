// Islands: an archipelago adrift in the sky. Rock masses hang over a sea of
// cloud; their grassy tops are joined by stone bridges; doorways stand on the
// outer islands. Falling off returns you to the last place you stood.
import { skeleton, addDoor, finish, hsl, xyaw, xf, BEARING, bearingVec, spreadBearing, mixRGB, scaleRGB } from '../worldgen.js';
import { fbm2, rng } from '../rng.js';
import { norm } from '../math.js';

export function islands(ctx) {
  const d = skeleton(ctx);
  const R = rng(ctx.seed);
  d.epithet = R.pick(['an archipelago of the air', 'islands adrift above the clouds', 'the hanging isles', 'a sky of stepping stones']);
  const dusk = R.chance(0.45), hue = R.range(0, 360);
  d.materials.rock = { color: mixRGB(hsl(hue + 20, 0.15, 0.42), [0.35, 0.33, 0.32], 0.5), rough: 0.9, detail: 'rock' };
  d.materials.grass = { color: dusk ? hsl(hue + 90, 0.35, 0.42) : hsl(95 + R.range(-25, 25), 0.45, 0.5), rough: 0.95, detail: 'moss', glow: [0, 0, 0] };
  d.materials.stone = { color: [0.6, 0.57, 0.52], rough: 0.8, detail: 'slabs' };
  d.materials.leaf = { color: dusk ? hsl(hue + 60, 0.4, 0.3) : hsl(110 + R.range(-30, 30), 0.5, 0.3), rough: 0.85 };
  d.materials.bark = { color: [0.2, 0.15, 0.12], rough: 0.9, detail: 'bark' };
  const isles = [];
  const isle = (x, y, z, r) => {
    isles.push({ x, y, z, r });
    d.features.push({ type: 'island', p: [x, y, z], r, depth: r * R.range(1.1, 1.9), mat: 'rock', top: 'grass', seed: R.int(1e9) });
    for (const a of [0, Math.PI / 4]) d.parts.push({ kind: 'box', xf: xyaw([x, y - 1.5, z], a), he: [r * 0.7, 1.5, r * 0.7], mat: 'grass', solid: true, hidden: true });
  };
  const yAt = (x, z) => { for (const s of isles) if (Math.hypot(x - s.x, z - s.z) < s.r * 0.96) return s.y; return -400; };
  isle(0, 0, 0, 30);
  const bridge = (a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    const x0 = a.x + ux * a.r * 0.8, z0 = a.z + uz * a.r * 0.8, x1 = b.x - ux * b.r * 0.8, z1 = b.z - uz * b.r * 0.8;
    const len = Math.hypot(x1 - x0, z1 - z0), rise = b.y - a.y, yaw = Math.atan2(dx, dz);
    const n = Math.max(1, Math.ceil(len / 6));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, tm = (t0 + t1) / 2;
      const y = a.y + rise * tm - 0.25, seg = len / n;
      const pitch = Math.atan2(rise, len);
      d.parts.push({ kind: 'box', xf: xf([x0 + (x1 - x0) * tm, y, z0 + (z1 - z0) * tm], qmulYawPitch(yaw, -pitch)), he: [1.3, 0.25, seg / 2 / Math.cos(pitch) + 0.05], mat: 'stone', solid: true });
      if (k % 2 === 0) for (const s of [-1, 1]) d.parts.push({ kind: 'box', xf: xyaw([x0 + (x1 - x0) * tm + Math.cos(yaw) * 1.25 * s, y + 0.9, z0 + (z1 - z0) * tm - Math.sin(yaw) * 1.25 * s], yaw), he: [0.12, 0.65, 0.12], mat: 'stone', solid: true });
    }
  };
  for (const link of ctx.links) {
    const b = (BEARING[link.slot] ?? R.range(-Math.PI, Math.PI)) + R.range(-0.3, 0.3);
    const dist = link.slot === 'W' ? 0 : R.range(70, 120);
    if (link.slot === 'W') {
      const v = bearingVec(b);
      addDoor(d, link, [v[0] * 22, 0, v[2] * 22], [0, 0, 0], { siteR: 0, blend: 0 });
      continue;
    }
    const v = bearingVec(spreadBearing(d, b, dist, [0, 0, 0], 40)), x = v[0] * dist, z = v[2] * dist, y = R.range(-14, 16), r = R.range(13, 20);
    isle(x, y, z, r);
    bridge(isles[0], isles[isles.length - 1]);
    addDoor(d, link, [x + v[0] * r * 0.45, y, z + v[2] * r * 0.45], [x, y, z], { siteR: 0, blend: 0, yaw: Math.atan2(-v[0], -v[2]) });
  }
  // the lodestone stands on its own islet, reached by a bridge
  const la = R.range(-Math.PI, Math.PI), lx = Math.sin(la) * 52, lz = -Math.cos(la) * 52;
  isle(lx, 6, lz, 9);
  bridge(isles[0], isles[isles.length - 1]);
  d.lodestone = { p: [lx, 6, lz], yaw: la, kind: 'crystal' };
  d.landmarks.push({ id: 'islet', name: 'The Lodestone Islet', p: [lx, 6, lz], note: 'A small island holding the lodestone, joined to the rest by a single bridge.' });
  // unreachable islands near and far
  for (let k = 0; k < 26; k++) {
    const a = R.range(0, Math.PI * 2), r = R.range(90, 900), x = Math.sin(a) * r, z = -Math.cos(a) * r;
    if (isles.some((s) => Math.hypot(x - s.x, z - s.z) < s.r + 30)) continue;
    d.features.push({ type: 'island', p: [x, R.range(-60, 140), z], r: R.range(8, 60), depth: R.range(15, 90), mat: 'rock', top: 'grass', seed: R.int(1e9) });
  }
  d.landmarks.push({ id: 'cloudsea', name: 'The Sea of Cloud', p: [0, -90, 0], note: 'Below every island, cloud to the horizon. Nothing lands.' });
  d.heightAt = yAt;
  d.scatter.push({ id: 1, kind: 'tree', cell: 7, prob: 0.4, scale: [0.7, 1.4], clear: 4, collide: { r: 0.35, h: 4 }, variants: 4, mat: 'bark', capMat: 'leaf',
    mask: (x, z) => (isles.some((s) => Math.hypot(x - s.x, z - s.z) < s.r * 0.8) ? 1 : 0) });
  d.scatter.push({ id: 2, kind: 'grass', cell: 1.6, prob: 0.5, scale: [0.6, 1.3], clear: 0.5, collide: null, variants: 3, mat: 'leaf', detail: true,
    mask: (x, z) => (isles.some((s) => Math.hypot(x - s.x, z - s.z) < s.r * 0.88) ? 0.6 + 0.4 * fbm2(x / 9, z / 9, ctx.seed, 2) : 0) });
  d.clearance = (x, z) => Math.min(...d.portals.map((P) => Math.hypot(x - P.xf.p[0], z - P.xf.p[2]) - 6), Math.hypot(x - lx, z - lz) - 3);
  const sd = dusk ? norm([R.range(-1, 1), 0.08, R.range(-1, 1)]) : norm([R.range(-1, 1), R.range(0.45, 0.8), R.range(-1, 1)]);
  d.atmos = dusk
    ? { fogColor: hsl(hue + 20, 0.4, 0.55), sunDir: sd, sunColor: [2.2, 1.2, 0.8], fogDensity: 0.0014, fogFalloff: 0.008, fogBase: -80, inscatter: 1.2 }
    : { fogColor: [0.66, 0.74, 0.86], sunDir: sd, sunColor: [2.4, 2.1, 1.8], fogDensity: 0.0012, fogFalloff: 0.008, fogBase: -80, inscatter: 0.7 };
  d.sky = dusk
    ? { zenith: hsl(hue + 220, 0.5, 0.2), horizon: hsl(hue + 15, 0.6, 0.6), ground: [0.5, 0.4, 0.4], sunSize: 0.02, sunGlow: 2, sunDisc: 20, moons: R.chance(0.5) ? [{ dir: norm([R.range(-1, 1), 0.4, R.range(-1, 1)]), size: 0.03, color: [0.9, 0.9, 0.95] }] : [], stars: 0.2, aurora: 0, clouds: 0.5, cloudScale: 0.5, cloudColor: hsl(hue + 10, 0.5, 0.7) }
    : { zenith: [0.12, 0.28, 0.6], horizon: [0.7, 0.8, 0.92], ground: [0.7, 0.72, 0.78], sunSize: 0.015, sunGlow: 1.3, sunDisc: 26, moons: [], stars: 0, aurora: 0, clouds: 0.45, cloudScale: 0.55, cloudColor: [1, 1, 1] };
  d.light = { sun: dusk ? 3.0 : 3.6, hemi: 0.6, hemiSky: dusk ? hsl(hue + 220, 0.4, 0.55) : [0.55, 0.65, 0.85], hemiGround: [0.45, 0.42, 0.4], env: 0.7, shadowRange: 50 };
  d.post = { exposure: dusk ? 0.9 : 0.78, saturation: 1.08, contrast: 1.05, lift: [0, 0, 0.01], gain: [1.02, 1.0, 0.98], bloom: 0.4 };
  d.features.push({ type: 'cloudsea', y: -95, color: d.atmos.fogColor, light: d.atmos.sunColor });
  d.features.push({ type: 'particles', kind: 'motes', count: 500, box: 50, color: [1, 1, 1], size: 0.03, speed: 0.3, glow: 0.3 });
  d.fill = mixRGB(d.atmos.fogColor, d.sky.horizon, 0.5);
  d.audio = { base: 'wind', tone: 262, wind: 0.8 };
  d.killHeight = -70;
  const W = d.portals.find((P) => P.slot === 'W');
  d.spawn = { feet: W ? [W.xf.p[0] * 0.5, 0, W.xf.p[2] * 0.5] : [0, 0, 0], yaw: 0 };
  void scaleRGB;
  return finish(d, null);
}

function qmulYawPitch(yaw, pitch) {
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
  return [cy * sp, sy * cp, -sy * sp, cy * cp];
}
