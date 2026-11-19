// Lumen forest: a night forest of colossal trees whose crowns and roots glow.
// Rolling ground under pooled mist, luminous fungi along the paths, drifting
// spores, a still black pool. The curated world (2,0) is cyan and violet.
import { skeleton, addDoor, finish, hsl, xyaw, xf, BEARING, bearingVec, siteClearance, pathDistance, scaleRGB, mixRGB } from '../worldgen.js';
import { fbm2, rng } from '../rng.js';
import { norm, smoothstep } from '../math.js';

export function forest(ctx) {
  const d = skeleton(ctx);
  const R = rng(ctx.seed);
  const curated = ctx.key === '2,0';
  d.name = curated ? 'Velloria' : ctx.name;
  const hueA = curated ? 186 : R.range(0, 360);              // glow colour
  const hueB = curated ? 285 : hueA + R.range(60, 140);      // accent glow
  d.epithet = R.pick(['a forest that remembers light', 'the lantern wood', 'a forest breathing in the dark', 'the luminous grove']);
  if (curated) d.epithet = 'a forest that remembers light';
  const glowA = hsl(hueA, 0.85, 0.62), glowB = hsl(hueB, 0.8, 0.62);

  const base = (x, z) => fbm2(x / 260, z / 260, ctx.seed, 4) * 16 + fbm2(x / 60, z / 60, ctx.seed + 9, 3) * 2.5;
  d.materials.ground = { color: curated ? [0.035, 0.05, 0.05] : scaleRGB(hsl(hueA + 120, 0.3, 0.2), 0.35), rough: 0.95, detail: 'moss', glow: glowA };
  d.materials.bark = { color: [0.06, 0.055, 0.06], rough: 0.85, detail: 'bark' };
  d.materials.cap = { color: [0.02, 0.02, 0.02], emissive: glowA, emissiveIntensity: 1.5, rough: 0.5, castShadow: false };
  d.materials.capB = { color: [0.02, 0.02, 0.02], emissive: glowB, emissiveIntensity: 1.6, rough: 0.5, castShadow: false };
  d.materials.fungus = { color: [0.05, 0.05, 0.05], emissive: mixRGB(glowA, [1, 1, 1], 0.25), emissiveIntensity: 3.0, castShadow: false };
  d.materials.threshold = { color: [0.24, 0.25, 0.27], rough: 0.8, detail: 'stone' };
  d.materials.water = { color: [0.0, 0.0, 0.0], rough: 0.05, metal: 0.0 };

  // ── Doorways and the paths between them.
  const center = [0, base(0, 0), 0];
  const doorFloors = [];
  for (const link of ctx.links) {
    const b = (BEARING[link.slot] ?? R.range(-Math.PI, Math.PI)) + (curated ? 0 : R.range(-0.3, 0.3));
    const dist = link.slot === 'W' ? 30 : (curated ? 120 : R.range(70, 130));
    const v = bearingVec(b);
    const x = v[0] * dist, z = v[2] * dist;
    const P = addDoor(d, link, [x, base(x, z) + 0.4, z], center, { siteR: 8, blend: 14 });
    doorFloors.push([x, z]);
    void P;
  }
  const paths = doorFloors.map((p) => [p, [0, 0]]);
  d.clearance = (x, z) => Math.min(siteClearance(d.sites.filter((s) => s.r > 0), x, z), ...paths.map((p) => pathDistance(p, x, z) - 2.5));

  // ── The lodestone in a clearing beside a still pool.
  d.lodestone = { p: [10, base(10, 8) + 0.2, 8], yaw: -0.6, kind: 'orb' };
  d.sites.push({ p: [10, base(10, 8), 8], r: 7, y: base(10, 8), blend: 12 });
  const pool = [-14, base(-14, 16) - 0.6, 16];
  d.features.push({ type: 'pool', p: pool, r: 9, mat: 'water' });
  d.sites.push({ p: [pool[0], pool[1] + 0.6, pool[2]], r: 10, y: pool[1] - 0.8, blend: 6 });
  d.landmarks.push({ id: 'pool', name: 'The Black Pool', p: pool, note: 'Still water that holds the canopy\'s light like a second sky.' });

  // ── A great tree: the eldest, at the heart of the wood.
  const eb = R.range(-Math.PI, Math.PI), ed = curated ? 70 : R.range(50, 110);
  const ex = Math.sin(eb) * ed, ez = -Math.cos(eb) * ed;
  d.features.push({ type: 'elder', p: [ex, base(ex, ez) - 1, ez], h: 85, r: 5.5, seed: ctx.seed, bark: 'bark', cap: 'cap', capB: 'capB' });
  d.parts.push({ kind: 'cyl', xf: xf([ex, base(ex, ez) + 20, ez]), r: 5.0, h: 44, mat: 'bark', solid: true, hidden: true });
  d.sites.push({ p: [ex, base(ex, ez), ez], r: 9, y: base(ex, ez), blend: 10 });
  d.landmarks.push({ id: 'elder', name: 'The Eldest', p: [ex, 0, ez], note: 'A tree eighty metres tall whose crown lights the mist for a mile around.' });

  // ── Scatter: lumen trees, fungi, glowing reeds.
  d.scatter.push({ id: 1, kind: 'lumentree', cell: 13, prob: 0.62, scale: [0.7, 1.35], clear: 3, collide: { r: 0.9, h: 18 }, variants: 4, mat: 'bark', capMat: 'cap', capMatB: 'capB',
    mask: (x, z) => 0.55 + 0.45 * smoothstep(-0.2, 0.3, fbm2(x / 140, z / 140, ctx.seed + 21, 2)) });
  d.scatter.push({ id: 2, kind: 'fungus', cell: 3.2, prob: 0.22, scale: [0.4, 1.3], clear: 0.5, collide: null, variants: 3, mat: 'fungus', detail: true,
    mask: (x, z) => smoothstep(0.0, 0.5, fbm2(x / 30, z / 30, ctx.seed + 31, 2) + 0.2) });
  d.scatter.push({ id: 3, kind: 'reed', cell: 2.2, prob: 0.3, scale: [0.6, 1.4], clear: 0.5, collide: null, variants: 2, mat: 'capB', detail: true,
    mask: (x, z) => smoothstep(0.1, 0.45, -fbm2(x / 45, z / 45, ctx.seed + 41, 2)) });

  // ── Night sky, mist and spores.
  const moonDir = norm([-0.35, 0.55, 0.6]);
  d.atmos = { fogColor: curated ? [0.02, 0.045, 0.062] : scaleRGB(hsl(hueA + 30, 0.5, 0.24), 0.25), sunDir: moonDir, sunColor: [0.28, 0.36, 0.55], fogDensity: 0.02, fogFalloff: 0.05, fogBase: base(0, 0) - 2, inscatter: 0.25 };
  d.sky = {
    zenith: [0.003, 0.006, 0.015], horizon: curated ? [0.02, 0.05, 0.07] : scaleRGB(hsl(hueA, 0.4, 0.2), 0.3), ground: [0.01, 0.015, 0.02],
    sunSize: 0.01, sunGlow: 0.2, sunDisc: 0, moons: [{ dir: moonDir, size: 0.04, color: [0.75, 0.85, 1.0] }], moonLight: norm([0.2, 0.5, 0.9]),
    stars: 0.8, aurora: curated ? 0.35 : R.range(0, 0.5), auroraColor: glowB, clouds: 0.1, cloudScale: 0.4, cloudColor: [0.03, 0.04, 0.06],
  };
  d.light = { sun: 0.9, hemi: 0.4, hemiSky: [0.08, 0.12, 0.2], hemiGround: scaleRGB(glowA, 0.08), env: 0.5, shadowRange: 40 };
  d.fill = [0.02, 0.05, 0.06];
  d.post = { exposure: 1.6, saturation: 1.0, contrast: 1.05, lift: [0.0, 0.006, 0.01], gain: [0.97, 1.0, 1.03], bloom: 0.9 };
  d.features.push({ type: 'terrain', mat: 'ground' });
  d.features.push({ type: 'particles', kind: 'spores', count: 1600, box: 40, color: mixRGB(glowA, [1, 1, 1], 0.2), color2: glowB, size: 0.06, speed: 0.25, glow: 2.5 });
  d.audio = { base: 'forest', tone: 220, wind: 0.2, chimes: 0.6 };
  const sp = doorFloors[0] || [0, 0];
  d.spawn = { feet: [sp[0] * 0.8, base(sp[0] * 0.8, sp[1] * 0.8) + 0.5, sp[1] * 0.8], yaw: 0 };
  void xyaw;
  return finish(d, base);
}
