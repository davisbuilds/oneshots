// Abstract: a pale geometric space. An endless matte plane under an even sky;
// large solids (cubes, spheres, rings, steps) rest on it or hang above it in
// a single accent colour; long soft shadows; nothing else.
import { skeleton, finish, hsl, xyaw, xf, ringDoors, siteClearance, mixRGB } from '../worldgen.js';
import { rng } from '../rng.js';
import { norm, qaxis } from '../math.js';

export const SOLIDS = [[2.5, 2.5, 2.5], [2.2, 2.2, 2.2], [3, 0.6, 3], [1, 4, 1]];

export function abstract(ctx) {
  const d = skeleton(ctx);
  const R = rng(ctx.seed);
  d.epithet = R.pick(['a space of pure forms', 'the white geometry', 'where shapes go to rest', 'the quiet plane']);
  const hue = R.range(0, 360), accent = hsl(hue, 0.65, 0.5), dark = R.chance(0.25);
  d.materials.plane = { color: dark ? [0.1, 0.1, 0.11] : [0.82, 0.8, 0.78], rough: 0.95, detail: 'slabs' };
  d.materials.white = { color: dark ? [0.2, 0.2, 0.21] : [0.88, 0.86, 0.84], rough: 0.6 };
  d.materials.accent = { color: accent, rough: 0.45 };
  d.materials.mirror = { color: [0.9, 0.9, 0.9], rough: 0.05, metal: 1.0 };
  d.materials.threshold = { color: dark ? [0.15, 0.15, 0.16] : [0.75, 0.74, 0.72], rough: 0.6 };
  d.materials.thresholdGlow = { color: [0.05, 0.05, 0.05], emissive: accent, emissiveIntensity: 4, castShadow: false };
  d.ground = { kind: 'plane', y: 0, mat: 'plane' };
  const flat = () => 0;
  ringDoors(d, ctx, R, flat, { near: 24, far: [70, 130], lift: 0 });
  // a composition at the centre: a ring standing on a cube, a sphere, steps
  d.parts.push({ kind: 'box', xf: xyaw([0, 4, -40], 0.4), he: [4, 4, 4], mat: 'white', solid: true });
  d.parts.push({ kind: 'torus', xf: xyaw([0, 18, -40], 0.4), r: 9, tube: 0.9, seg: 64, mat: 'accent', solid: false });
  d.parts.push({ kind: 'sphere', xf: xf([22, 7, -28]), r: 7, seg: 48, mat: 'mirror', solid: true });
  for (let s = 0; s < 12; s++) d.parts.push({ kind: 'box', xf: xyaw([-24, 0.5 + s * 1.0, -20 - s * 1.6], 0), he: [2.5, 0.5, 0.8], mat: s % 3 === 2 ? 'accent' : 'white', solid: true });
  d.landmarks.push({ id: 'ring', name: 'The Ring on the Cube', p: [0, 0, -40], note: 'A ring nine metres across, balanced on a cube. Neither moves.' });
  // floating solids
  for (let k = 0; k < 18; k++) {
    const a = R.range(0, Math.PI * 2), r = R.range(30, 260), x = Math.sin(a) * r, z = -Math.cos(a) * r, y = R.range(8, 70), s = R.range(1.5, 9);
    if (siteClearance(d.sites, x, z) < 14) continue;
    const kind = R.pick(['box', 'sphere', 'torus', 'ico']);
    const q = qaxis(norm([R.range(-1, 1), R.range(-1, 1), R.range(-1, 1)]), R.range(0, 3));
    const mat = R.chance(0.3) ? 'accent' : R.chance(0.15) ? 'mirror' : 'white';
    if (kind === 'box') d.parts.push({ kind, xf: xf([x, y, z], q), he: [s, s, s], mat, solid: false });
    else if (kind === 'sphere') d.parts.push({ kind, xf: xf([x, y, z]), r: s, seg: 32, mat, solid: false });
    else if (kind === 'torus') d.parts.push({ kind, xf: xf([x, y, z], q), r: s, tube: s * 0.12, seg: 48, mat, solid: false });
    else d.parts.push({ kind, xf: xf([x, y, z], q), r: s, detail: 0, mat, solid: false });
  }
  d.lodestone = { p: [9, 0, -30], yaw: 0, kind: 'ring' };
  d.clearance = (x, z) => Math.min(siteClearance(d.sites, x, z) - 6, Math.hypot(x, z + 34) - 34, Math.hypot(x, z) - 20);
  d.scatter.push({ id: 1, kind: 'solid', cell: 26, prob: 0.4, scale: [0.6, 1.8], clear: 12, reach: 20, collide: { box: SOLIDS.map(([x, y, z]) => [x, y, z]) }, variants: 4, mat: 'white', capMat: 'accent' });
  const sd = norm([R.range(-1, 1), R.range(0.25, 0.6), R.range(-1, 1)]);
  d.atmos = { fogColor: dark ? [0.05, 0.05, 0.06] : [0.86, 0.85, 0.84], sunDir: sd, sunColor: dark ? [2.6, 2.5, 2.4] : [2.8, 2.7, 2.6], fogDensity: 0.0012, fogFalloff: 0.002, fogBase: 0, inscatter: 0.2 };
  d.sky = { zenith: dark ? [0.02, 0.02, 0.025] : [0.62, 0.68, 0.76], horizon: d.atmos.fogColor, ground: d.atmos.fogColor, sunSize: 0.01, sunGlow: 0.3, sunDisc: 0, moons: [], stars: dark ? 0.6 : 0, aurora: 0, clouds: 0, cloudScale: 0.5, cloudColor: [1, 1, 1] };
  d.light = { sun: 3.0, hemi: dark ? 0.2 : 0.5, hemiSky: [0.9, 0.9, 0.95], hemiGround: [0.6, 0.58, 0.56], env: 0.8, shadowRange: 60 };
  d.post = { exposure: dark ? 1.2 : 0.6, saturation: 1.0, contrast: 1.08, lift: [0, 0, 0], gain: [1, 1, 1], bloom: 0.3 };
  d.fill = d.atmos.fogColor;
  d.audio = { base: 'tone', tone: 330, wind: 0.05 };
  d.heightAt = flat;
  const W = d.portals.find((P) => P.slot === 'W');
  d.spawn = { feet: W ? [W.xf.p[0] * 0.6, 0, W.xf.p[2] * 0.6] : [0, 0, 0], yaw: 0 };
  void mixRGB;
  return finish(d, null);
}
