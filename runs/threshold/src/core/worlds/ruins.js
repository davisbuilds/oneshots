// Ruins: hills in a long golden light, crowned by the broken temples of
// someone who also built doorways. Peristyles of fluted columns on stepped
// platforms, fallen drums, walls of a cella, cypresses and grass.
import { skeleton, finish, hsl, xyaw, xf, ringDoors, siteClearance, mixRGB } from '../worldgen.js';
import { fbm2, ridged2, rng } from '../rng.js';
import { norm, qaxis } from '../math.js';

export function ruins(ctx) {
  const d = skeleton(ctx);
  const R = rng(ctx.seed);
  d.epithet = R.pick(['the temples on the hills', 'a country of broken columns', 'the long afternoon of an empire', 'hills of marble and cypress']);
  const hue = R.range(20, 50), mist = R.chance(0.35);
  const base = (x, z) => fbm2(x / 300, z / 300, ctx.seed, 4) * 34 + ridged2(x / 140, z / 140, ctx.seed + 4, 3) * 10;
  d.materials.ground = { color: hsl(hue + 40, 0.3, 0.32), rough: 0.95, detail: 'moss', glow: [0, 0, 0] };
  d.materials.marble = { color: hsl(hue, 0.12, 0.74), rough: 0.55, detail: 'stone' };
  d.materials.marbleDark = { color: hsl(hue, 0.1, 0.55), rough: 0.7, detail: 'stone' };
  d.materials.leaf = { color: hsl(110 + R.range(-20, 15), 0.45, 0.18), rough: 0.9 };
  d.materials.bark = { color: [0.16, 0.12, 0.1], rough: 0.9, detail: 'bark' };
  d.materials.threshold = { color: hsl(hue, 0.1, 0.6), rough: 0.7, detail: 'stone' };
  ringDoors(d, ctx, R, base, { near: 28, far: [80, 150] });
  const yAt = (x, z) => base(x, z);
  // temples on the higher ground
  const temples = [];
  for (let k = 0; k < 4 + R.int(3); k++) {
    let best = null;
    for (let t = 0; t < 14; t++) {
      const a = R.range(0, Math.PI * 2), r = R.range(45, 330), x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (siteClearance(d.sites, x, z) < 30 || temples.some((q) => Math.hypot(q.x - x, q.z - z) < 60)) continue;
      const h = yAt(x, z); if (!best || h > best.h) best = { x, z, h };
    }
    if (!best) continue;
    temples.push(best);
    temple(d, R, best.x, best.h, best.z, R.range(0, Math.PI));
  }
  d.landmarks.push({ id: 'temple', name: 'The Highest Temple', p: temples[0] ? [temples[0].x, temples[0].h, temples[0].z] : [0, 0, 0], note: 'Columns still standing on a hill, their shadows longer than they are.' });
  const t0 = temples[0];
  if (t0) d.lodestone = { p: [t0.x, t0.h + 1.2, t0.z], yaw: 0, kind: 'orb' };
  else d.lodestone = { p: [8, yAt(8, -8), -8], yaw: 0, kind: 'orb' };
  d.clearance = (x, z) => Math.min(siteClearance(d.sites, x, z), ...temples.map((t) => Math.hypot(x - t.x, z - t.z) - 16));
  d.scatter.push({ id: 1, kind: 'cypress', cell: 11, prob: 0.3, scale: [0.8, 1.5], clear: 3, collide: { r: 0.4, h: 6 }, variants: 4, mat: 'bark', capMat: 'leaf', mask: (x, z) => 0.3 + 0.7 * Math.max(0, fbm2(x / 160, z / 160, ctx.seed + 8, 2) + 0.2) });
  d.scatter.push({ id: 2, kind: 'grass', cell: 1.7, prob: 0.55, scale: [0.6, 1.4], clear: 1, collide: null, variants: 3, mat: 'leaf', detail: true });
  d.scatter.push({ id: 3, kind: 'rock', cell: 16, prob: 0.08, scale: [0.6, 2.0], clear: 6, collide: { r: 0.8, h: 1.2, y0: -0.3 }, variants: 4, mat: 'marbleDark' });
  // the sites must be flat before the temples are placed on them
  for (const t of temples) d.sites.push({ p: [t.x, t.h, t.z], r: 15, y: t.h, blend: 12 });
  const sd = norm([R.range(-1, 1), mist ? 0.3 : 0.14, R.range(-1, 1)]);
  d.atmos = { fogColor: mist ? [0.62, 0.62, 0.6] : hsl(hue + 10, 0.45, 0.62), sunDir: sd, sunColor: [2.6, 1.85, 1.15], fogDensity: mist ? 0.006 : 0.0022, fogFalloff: 0.02, fogBase: 0, inscatter: 1.1 };
  d.sky = { zenith: [0.16, 0.26, 0.48], horizon: hsl(hue + 10, 0.55, 0.72), ground: [0.4, 0.35, 0.28], sunSize: 0.016, sunGlow: 1.6, sunDisc: 24, moons: R.chance(0.3) ? [{ dir: norm([R.range(-1, 1), 0.35, R.range(-1, 1)]), size: 0.025, color: [0.95, 0.92, 0.88] }] : [], stars: 0, aurora: 0, clouds: R.range(0.2, 0.55), cloudScale: 0.55, cloudColor: [1.0, 0.92, 0.82] };
  d.light = { sun: 4.2, hemi: 0.5, hemiSky: [0.5, 0.58, 0.75], hemiGround: hsl(hue + 30, 0.3, 0.35), env: 0.6, shadowRange: 55 };
  d.post = { exposure: 0.82, saturation: 1.08, contrast: 1.07, lift: [0.01, 0.005, 0.0], gain: [1.04, 1.0, 0.94], bloom: 0.4 };
  d.fill = mixRGB(d.atmos.fogColor, d.sky.horizon, 0.5);
  d.features.push({ type: 'terrain', mat: 'ground' });
  d.features.push({ type: 'particles', kind: 'motes', count: 900, box: 45, color: [1.0, 0.85, 0.55], size: 0.035, speed: 0.15, glow: 0.4 });
  d.audio = { base: 'wind', tone: 233, wind: 0.5 };
  const W = d.portals.find((P) => P.slot === 'W');
  d.spawn = { feet: W ? [W.xf.p[0] * 0.6, yAt(W.xf.p[0] * 0.6, W.xf.p[2] * 0.6) + 0.4, W.xf.p[2] * 0.6] : [0, yAt(0, 0) + 0.4, 0], yaw: 0 };
  return finish(d, base);
}

// A peristyle temple on a three-step platform, partly fallen.
function temple(d, R, x, y, z, yaw) {
  const nx = 3 + R.int(3), nz = nx + 2 + R.int(3), sp = 3.4, W = (nx - 1) * sp / 2 + 2.6, L = (nz - 1) * sp / 2 + 2.6;
  const local = (lx, ly, lz) => [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, y + ly, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz];
  for (let s = 0; s < 3; s++) d.parts.push({ kind: 'box', xf: xyaw(local(0, -0.5 + s * 0.4, 0), yaw), he: [W - s * 0.6 + 0.6, 0.2 + (s === 0 ? 1.5 : 0), L - s * 0.6 + 0.6], mat: 'marble', solid: true });
  const top = 0.9;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if (i > 0 && i < nx - 1 && j > 0 && j < nz - 1) continue;
    const lx = -((nx - 1) * sp) / 2 + i * sp, lz = -((nz - 1) * sp) / 2 + j * sp;
    const fate = R.next();
    if (fate < 0.18) {
      // fallen: drums lying on the platform or the ground nearby
      const a = R.range(0, Math.PI * 2), dist = R.range(1, 4);
      for (let k = 0; k < 3; k++) d.parts.push({ kind: 'cyl', xf: xf(local(lx + Math.cos(a) * (dist + k * 1.7), top + 0.55, lz + Math.sin(a) * (dist + k * 1.7)), qaxis([Math.sin(a), 0, -Math.cos(a)], Math.PI / 2)), r: 0.55, h: 1.6, seg: 16, mat: 'marble', solid: true });
      continue;
    }
    const h = fate < 0.4 ? R.range(1.5, 5) : 8.2;
    d.parts.push({ kind: 'box', xf: xyaw(local(lx, top + 0.2, lz), yaw), he: [0.75, 0.2, 0.75], mat: 'marbleDark', solid: true });
    d.parts.push({ kind: 'cyl', xf: xf(local(lx, top + 0.4 + h / 2, lz)), r1: 0.5, r: 0.58, h, seg: 20, mat: 'marble', solid: true });
    if (h > 8) d.parts.push({ kind: 'box', xf: xyaw(local(lx, top + 0.4 + h + 0.25, lz), yaw), he: [0.8, 0.25, 0.8], mat: 'marbleDark', solid: true });
  }
  // a surviving run of architrave along one long side
  if (R.chance(0.7)) d.parts.push({ kind: 'box', xf: xyaw(local(-((nx - 1) * sp) / 2, top + 9.4, -sp), yaw), he: [0.7, 0.5, sp * 1.6], mat: 'marble', solid: true });
  // the cella walls, broken
  d.parts.push({ kind: 'box', xf: xyaw(local(0, top + 2.2, -L * 0.3), yaw), he: [W * 0.55, 2.2 * R.range(0.5, 1), 0.35], mat: 'marbleDark', solid: true });
  d.parts.push({ kind: 'box', xf: xyaw(local(W * 0.55, top + 1.4, 0), yaw), he: [0.35, 1.4 * R.range(0.4, 1), L * 0.35], mat: 'marbleDark', solid: true });
}
