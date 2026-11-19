// Cavern: a chamber kilometres wide under a stone sky. The floor rolls and
// pools; the ceiling hangs seventy metres up with stalactites; crystals glow
// in clusters and are the only light besides your own.
import { skeleton, finish, hsl, xyaw, ringDoors, siteClearance, mixRGB, scaleRGB } from '../worldgen.js';
import { fbm2, ridged2, rng } from '../rng.js';
import { norm } from '../math.js';

export function cavern(ctx) {
  const d = skeleton(ctx);
  const R = rng(ctx.seed);
  d.epithet = R.pick(['a cave the size of a country', 'the hollow under the world', 'the vault of crystals', 'a stone sky']);
  const hue = R.range(0, 360), glow = hsl(hue, 0.85, 0.6), glow2 = hsl(hue + R.range(40, 90), 0.8, 0.6);
  const base = (x, z) => fbm2(x / 220, z / 220, ctx.seed, 4) * 14 + ridged2(x / 90, z / 90, ctx.seed + 2, 3) * 5;
  const ceil = (x, z) => base(x, z) + 46 + Math.max(0, fbm2(x / 300, z / 300, ctx.seed + 9, 4) * 60 + 25) + ridged2(x / 70, z / 70, ctx.seed + 5, 3) * 8;
  d.materials.floor = { color: hsl(hue + 180, 0.08, 0.2), rough: 0.9, detail: 'rock' };
  d.materials.rock = { color: hsl(hue + 180, 0.06, 0.26), rough: 0.85, detail: 'rock' };
  d.materials.crystal = { color: [0.02, 0.02, 0.02], emissive: glow, emissiveIntensity: 3.2, rough: 0.2, castShadow: false };
  d.materials.crystalB = { color: [0.02, 0.02, 0.02], emissive: glow2, emissiveIntensity: 2.6, rough: 0.2, castShadow: false };
  d.materials.water = { color: [0, 0, 0], rough: 0.05 };
  d.materials.threshold = { color: [0.3, 0.3, 0.32], rough: 0.8, detail: 'stone' };
  ringDoors(d, ctx, R, base, { near: 26, far: [70, 130] });
  d.ceilingAt = ceil;
  // underground lakes in the low places
  const lakes = [];
  for (let k = 0; k < 3; k++) {
    const a = R.range(0, Math.PI * 2), r = R.range(40, 200), x = Math.sin(a) * r, z = -Math.cos(a) * r;
    if (siteClearance(d.sites, x, z) < 25) continue;
    const y = base(x, z) - 0.8, rad = R.range(10, 26);
    lakes.push({ x, z, rad });
    d.features.push({ type: 'pool', p: [x, y, z], r: rad, mat: 'water' });
    d.sites.push({ p: [x, y + 0.8, z], r: rad + 1, y: y - 1.5, blend: 8 });
  }
  // a great column where floor and ceiling meet
  const ca = R.range(0, Math.PI * 2), cd = R.range(60, 120), cx = Math.sin(ca) * cd, cz = -Math.cos(ca) * cd;
  d.parts.push({ kind: 'cyl', xf: xyaw([cx, base(cx, cz) + 60, cz], 0), r1: 9, r: 14, h: 130, seg: 20, mat: 'rock', solid: true });
  d.landmarks.push({ id: 'column', name: 'The Pillar of the World', p: [cx, 0, cz], note: 'A column of living rock fourteen metres across, holding up the ceiling.' });
  d.lodestone = { p: [-10, base(-10, 6) + 0.2, 6], yaw: 0.5, kind: 'crystal' };
  d.sites.push({ p: [-10, base(-10, 6), 6], r: 5, y: base(-10, 6), blend: 8 });
  d.clearance = (x, z) => Math.min(siteClearance(d.sites.filter((s) => s.r > 0), x, z), Math.hypot(x - cx, z - cz) - 18);
  d.scatter.push({ id: 1, kind: 'stalagmite', cell: 9, prob: 0.28, scale: [0.5, 2.2], clear: 4, collide: { r: 0.9, h: 4 }, variants: 4, mat: 'rock' });
  d.scatter.push({ id: 2, kind: 'stalactite', cell: 8, prob: 0.4, scale: [0.6, 2.6], clear: 0, collide: null, variants: 4, mat: 'rock', ceiling: true });
  d.scatter.push({ id: 3, kind: 'crystal', cell: 13, prob: 0.3, scale: [0.6, 2.4], clear: 3, collide: { r: 0.7, h: 2 }, variants: 4, mat: 'crystal', capMatB: 'crystalB',
    mask: (x, z) => 0.2 + 0.8 * Math.max(0, fbm2(x / 70, z / 70, ctx.seed + 13, 2) + 0.25) });
  const lightDir = norm([0.3, 1, 0.2]);
  d.atmos = { fogColor: scaleRGB(mixRGB(glow, [0.05, 0.05, 0.07], 0.8), 0.09), sunDir: lightDir, sunColor: [0, 0, 0], fogDensity: 0.008, fogFalloff: 0.01, fogBase: 0, inscatter: 0.0 };
  d.sky = { zenith: [0, 0, 0], horizon: [0.01, 0.01, 0.012], ground: [0, 0, 0], sunSize: 0.01, sunGlow: 0, sunDisc: 0, moons: [], stars: 0, aurora: 0, clouds: 0, cloudScale: 0.5, cloudColor: [0, 0, 0] };
  d.light = { sun: 0, hemi: 0.35, hemiSky: scaleRGB(glow, 0.25), hemiGround: scaleRGB(glow2, 0.12), env: 0.3, shadows: false };
  d.post = { exposure: 1.45, saturation: 1.05, contrast: 1.06, lift: [0.004, 0.006, 0.012], gain: [1, 1, 1.02], bloom: 0.9 };
  d.fill = d.atmos.fogColor;
  d.features.push({ type: 'terrain', mat: 'floor' });
  d.features.push({ type: 'ceiling', mat: 'rock' });
  d.features.push({ type: 'particles', kind: 'spores', count: 900, box: 40, color: mixRGB(glow, [1, 1, 1], 0.3), color2: glow2, size: 0.04, speed: 0.12, glow: 1.6 });
  d.audio = { base: 'cave', tone: 98, wind: 0.1, drips: 0.8 };
  const W = d.portals.find((P) => P.slot === 'W');
  d.spawn = { feet: W ? [W.xf.p[0] * 0.6, base(W.xf.p[0] * 0.6, W.xf.p[2] * 0.6) + 0.4, W.xf.p[2] * 0.6] : [0, base(0, 0) + 0.4, 0], yaw: 0 };
  void lakes;
  return finish(d, base);
}
