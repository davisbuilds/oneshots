// Dunes: an alien desert. Wind-aligned dune ridges with gentle windward
// slopes and steep slip faces, broken up by large-scale swells; mesas on the
// horizon; a colossal ring half sunk in the sand; moons. The curated world
// (1,0) is the desert of three moons seen through the great doorway.
import { skeleton, addDoor, finish, hsl, xyaw, xf, BEARING, bearingVec, siteClearance, spreadBearing, scaleRGB, mixRGB } from '../worldgen.js';
import { fbm2, noise2, rng } from '../rng.js';
import { smoothstep, norm, qaxis } from '../math.js';
import { makePortal } from '../portal.js';
import { frameParts } from '../frames.js';
import { POCKET_DOORS } from './pockets.js';

export function dunesHeight(seed, opts = {}) {
  const wa = opts.wind ?? (seed % 628) / 100;
  const wx = Math.cos(wa), wz = Math.sin(wa);
  const lambda = opts.wavelength ?? 72, amp = opts.amp ?? 8;
  return (x, z) => {
    const u = x * wx + z * wz, v = -x * wz + z * wx;
    const swell = fbm2(x / 650, z / 650, seed, 4) * 26;
    const warp = fbm2(x / 190, z / 190, seed + 7, 3) * 55 + noise2(v / 90, u / 300, seed + 11) * 20;
    const ph = (u + warp) / lambda, f = ph - Math.floor(ph);
    const s = (t) => t * t * (3 - 2 * t);
    const prof = f < 0.76 ? s(f / 0.76) : 1 - s((f - 0.76) / 0.24);
    const a = amp * (0.55 + 0.75 * (0.5 + 0.5 * fbm2(v / 260, u / 420, seed + 3, 3)));
    return swell + a * Math.pow(prof, 1.25) + fbm2(x / 23, z / 23, seed + 5, 2) * 0.5;
  };
}

export function dunes(ctx) {
  const d = skeleton(ctx);
  const R = rng(ctx.seed);
  const curated = ctx.key === '1,0';
  const base = dunesHeight(ctx.seed, curated ? { wind: 0.35, wavelength: 92, amp: 15 } : { amp: 5 + R.next() * 7, wavelength: 55 + R.next() * 40 });
  const moons = curated ? 3 : R.int(4);
  d.epithet = moons === 3 ? 'the desert of three moons' : moons === 0 ? 'a desert under a white sun' : moons === 1 ? 'a desert under one moon' : 'a desert of two moons';
  d.name = curated ? 'Ashmere' : ctx.name;

  // Palette: night deserts are moonlit and cool; day deserts are hazy and hot.
  const night = curated || R.chance(0.55);
  const hue = curated ? 18 : R.range(0, 360);
  const sand = curated ? [0.62, 0.48, 0.42] : hsl(hue + R.range(-20, 20), R.range(0.25, 0.5), R.range(0.55, 0.72));
  d.materials.sand = { color: sand, rough: 0.92, detail: 'sand' };
  d.materials.rock = { color: mixRGB(sand, [0.25, 0.2, 0.2], 0.55), rough: 0.88, detail: 'rock' };
  d.materials.threshold = { color: [0.45, 0.4, 0.38], rough: 0.8, detail: 'stone' };
  d.materials.relic = { color: [0.3, 0.28, 0.3], rough: 0.5, metal: 0.4, detail: 'stone' };
  d.materials.glyph = { color: [0.05, 0.05, 0.05], emissive: curated ? [0.5, 0.75, 1.0] : hsl(hue + 180, 0.7, 0.6), emissiveIntensity: 3.5, castShadow: false };

  // ── Doorways. The arrival (W) is near the centre; the others are far out on the dunes.
  const center = [0, 0, 0];
  const yAt = (x, z) => base(x, z);
  for (const link of ctx.links) {
    const b = BEARING[link.slot] ?? R.range(-Math.PI, Math.PI);
    const dist = link.slot === 'W' ? 34 : (curated ? (link.slot === 'E' ? 165 : 120) : R.range(90, 170));
    const v = bearingVec(curated ? b : spreadBearing(d, b + R.range(-0.25, 0.25), dist));
    const x = v[0] * dist, z = v[2] * dist;
    addDoor(d, link, [x, yAt(x, z) + 0.6, z], center, { siteR: curated && link.slot === 'W' ? 22 : 7, blend: curated && link.slot === 'W' ? 24 : 16 });
  }

  // ── The lodestone on a low rise near the arrival.
  const lx = 6, lz = -12;
  d.lodestone = { p: [lx, yAt(lx, lz) + 0.2, lz], yaw: 0.4, kind: 'obelisk' };
  d.sites.push({ p: [lx, yAt(lx, lz), lz], r: 4, y: yAt(lx, lz), blend: 10 });

  // ── Landmarks: a colossal ring half-sunk in the sand, an avenue of obelisks.
  const rb = curated ? -0.55 : R.range(-Math.PI, Math.PI), rd = curated ? 230 : R.range(180, 320);
  const rp = [Math.sin(rb) * rd, 0, -Math.cos(rb) * rd];
  rp[1] = yAt(rp[0], rp[2]) - 18;
  d.features.push({ type: 'ring', p: rp, r: 42, tube: 4.5, yaw: rb + 1.2, mat: 'relic', glyph: 'glyph', solidSegments: true });
  d.landmarks.push({ id: 'ring', name: 'The Sunken Ring', p: rp, note: 'A ring of dark metal taller than a tower, mostly buried. Glyphs still glow along its rim.' });
  d.sites.push({ p: [rp[0], rp[1] + 18, rp[2]], r: 0, y: rp[1] + 18, blend: 0 });
  // obelisks marching toward the far doorway
  const far = d.portals.find((P) => P.slot === 'E') || d.portals[0];
  if (far) {
    for (let k = 1; k <= 6; k++) {
      const t = k / 7, x = far.xf.p[0] * t + Math.sin(k * 1.7) * 6, z = far.xf.p[2] * t + Math.cos(k * 1.3) * 6;
      const h = 5 + (k % 3) * 2.5;
      d.parts.push({ kind: 'box', xf: xyaw([x, yAt(x, z) + h / 2 - 1, z], R.range(0, 3)), he: [0.7, h / 2, 0.7], mat: 'relic', solid: true });
      d.parts.push({ kind: 'box', xf: xyaw([x, yAt(x, z) + h - 1.6, z], 0.3 * k), he: [0.72, 0.08, 0.72], mat: 'glyph', solid: false });
      d.sites.push({ p: [x, yAt(x, z), z], r: 0, y: yAt(x, z), blend: 0 });
    }
    d.landmarks.push({ id: 'avenue', name: 'The Avenue of Lamps', p: [far.xf.p[0] * 0.5, 0, far.xf.p[2] * 0.5], note: 'Six obelisks, each lit at the crown, point the way across the dunes.' });
  }
  // In the curated desert, a lone window frame stands in the sand: through it,
  // the columns of the Inner Hall (its west window).
  if (curated) {
    const hw = POCKET_DOORS.hallwin, wx = 38, wz = 30, wy = yAt(wx, wz) + 0.4, wyaw = Math.atan2(-wx, -wz);
    const Wp = makePortal({ world: d.key, slot: 'hallwin', p: [wx, wy + hw.sill + hw.hh, wz], q: qaxis([0, 1, 0], wyaw), hw: hw.hw, hh: hw.hh, link: { world: '0,0/hall', slot: 'win-a' }, style: 'gate' });
    d.portals.push(Wp);
    d.parts.push(...frameParts(Wp, 'gate', { mat: 'relic', trim: 'glyph' }));
    d.parts.push({ kind: 'box', xf: xyaw([wx, wy + hw.sill / 2 - 0.45, wz], wyaw), he: [hw.hw + 0.6, hw.sill / 2 + 0.45, 0.5], mat: 'relic', solid: true });
    d.sites.push({ p: [wx, wy, wz], r: 6, y: wy, blend: 10 });
    // a door on a low plinth among the dunes, rolled a quarter turn from the room behind it
    const td = POCKET_DOORS.tilt, tx = 54, tz = -34, ty = yAt(tx, tz) + 0.5, tyaw = Math.atan2(-tx, -tz);
    const Tp = makePortal({ world: d.key, slot: 'tilt', p: [tx, ty + td.hh, tz], q: qaxis([0, 1, 0], tyaw), hw: td.hw, hh: td.hh, link: { world: '1,0/tilt', slot: 'door' }, style: 'collar' });
    d.portals.push(Tp);
    d.parts.push(...frameParts(Tp, 'collar', { mat: 'relic' }));
    d.parts.push({ kind: 'box', xf: xyaw([tx, ty - 0.5, tz], tyaw), he: [2.2, 0.5, 2.4], mat: 'relic', solid: true });
    d.sites.push({ p: [tx, ty - 0.5, tz], r: 4, y: ty - 0.5, blend: 9 });
    d.landmarks.push({ id: 'tilt', name: 'The Sideways Door', p: [tx, ty, tz], note: 'Through this door a lamp hangs sideways and a table stands on the wall.' });
    d.landmarks.push({ id: 'window', name: 'A Window in the Sand', p: [wx, wy, wz], note: 'A window frame standing alone in the dunes. Through it, a hall of columns in afternoon light.' });
  }
  d.features.push({ type: 'mesas', seed: ctx.seed, n: 16, r0: 700, r1: 1900, mat: 'rock', h0: 60, h1: 260 });

  // ── Scatter: wind-carved rocks and tall alien spires.
  d.clearance = (x, z) => siteClearance(d.sites.filter((s) => s.r > 0), x, z);
  d.scatter.push({ id: 1, kind: 'rock', cell: 12, prob: 0.07, scale: [0.6, 2.6], clear: 6, collide: { r: 0.8, h: 1.2, y0: -0.3 }, variants: 4, mat: 'rock' });
  d.scatter.push({ id: 2, kind: 'spire', cell: 32, prob: 0.14, scale: [0.7, 1.6], clear: 14, collide: { r: 0.7, h: 9 }, variants: 3, mat: 'rock' });

  // ── Sky and light.
  if (curated) {
    // Twilight: the sun has just set in the west (behind the great door); its
    // afterglow lights the west-facing dunes rose. Three moons rise in the east,
    // composed to sit inside the great door's view from the Threshold.
    const moonList = [
      { dir: norm([0.97, 0.26, 0.0]), size: 0.082, color: [0.98, 0.92, 0.84] },
      { dir: norm([0.995, 0.085, 0.07]), size: 0.04, color: [1.0, 0.5, 0.32] },
      { dir: norm([0.9, 0.43, -0.05]), size: 0.022, color: [0.62, 0.82, 1.0] },
    ];
    d.atmos = { fogColor: [0.2, 0.12, 0.18], sunDir: norm([-0.96, 0.07, 0.12]), sunColor: [1.25, 0.6, 0.48], fogDensity: 0.0024, fogFalloff: 0.011, fogBase: 0, inscatter: 0.9 };
    d.sky = {
      zenith: [0.018, 0.022, 0.07], horizon: [0.42, 0.22, 0.3], ground: [0.08, 0.05, 0.07],
      sunSize: 0.01, sunGlow: 1.4, sunDisc: 0, moons: moonList, moonLight: norm([-0.9, 0.2, 0.3]),
      stars: 0.7, aurora: 0, clouds: 0.22, cloudScale: 0.42, cloudColor: [0.3, 0.18, 0.24],
    };
    d.light = { sun: 2.6, hemi: 0.6, hemiSky: [0.3, 0.3, 0.55], hemiGround: [0.2, 0.12, 0.13], env: 0.6, shadowRange: 55 };
    d.post = { exposure: 1.3, saturation: 1.06, contrast: 1.07, lift: [0.006, 0.0, 0.018], gain: [1.02, 0.98, 1.02], bloom: 0.6 };
  } else if (night) {
    const moonList = Array.from({ length: Math.max(1, moons) }, () => ({ dir: norm([R.range(-1, 1), R.range(0.15, 0.7), R.range(-1, 1)]), size: R.range(0.02, 0.09), color: hsl(R.range(0, 360), R.range(0.1, 0.5), R.range(0.6, 0.85)) }));
    const md = moonList[0].dir;
    d.atmos = { fogColor: scaleRGB(hsl(hue + 220, 0.35, 0.3), 0.4), sunDir: md, sunColor: [0.55, 0.62, 0.86], fogDensity: 0.0026, fogFalloff: 0.012, fogBase: 0, inscatter: 0.5 };
    d.sky = {
      zenith: scaleRGB(hsl(hue + 230, 0.6, 0.12), 0.5), horizon: scaleRGB(hsl(hue + 300, 0.4, 0.3), 0.5), ground: [0.05, 0.04, 0.05],
      sunSize: 0.01, sunGlow: 0.4, sunDisc: 0, moons: moonList, moonLight: norm([R.range(-1, 1), 0.3, R.range(-1, 1)]),
      stars: 1.0, aurora: 0, clouds: R.range(0, 0.3), cloudScale: 0.4, cloudColor: [0.12, 0.1, 0.14],
    };
    d.light = { sun: 1.9, hemi: 0.55, hemiSky: [0.22, 0.24, 0.4], hemiGround: [0.16, 0.1, 0.1], env: 0.6, shadowRange: 50 };
    d.post = { exposure: 1.75, saturation: 1.0, contrast: 1.06, lift: [0.0, 0.004, 0.015], gain: [0.98, 1.0, 1.04], bloom: 0.6 };
  } else {
    const sd = norm([R.range(-1, 1), R.range(0.35, 0.8), R.range(-1, 1)]);
    d.atmos = { fogColor: hsl(hue + 10, 0.35, 0.72), sunDir: sd, sunColor: [2.2, 1.9, 1.5], fogDensity: 0.004, fogFalloff: 0.01, fogBase: 0, inscatter: 0.8 };
    d.sky = { zenith: hsl(hue + 200, 0.45, 0.45), horizon: hsl(hue + 20, 0.35, 0.78), ground: [0.4, 0.33, 0.28], sunSize: 0.02, sunGlow: 1.6, sunDisc: 20, moons: moons ? [{ dir: norm([R.range(-1, 1), 0.5, R.range(-1, 1)]), size: 0.05, color: [0.9, 0.9, 0.9] }] : [], stars: 0, aurora: 0, clouds: R.range(0, 0.35), cloudScale: 0.6, cloudColor: [1, 0.95, 0.9] };
    d.light = { sun: 3.4, hemi: 0.8, hemiSky: hsl(hue + 200, 0.4, 0.7), hemiGround: sand, env: 0.7, shadowRange: 50 };
    d.post = { exposure: 0.9, saturation: 1.05, contrast: 1.05, lift: [0.01, 0.0, 0.0], gain: [1.03, 1.0, 0.95], bloom: 0.35 };
  }
  d.fill = mixRGB(d.atmos.fogColor, d.sky.horizon, 0.5);
  d.features.push({ type: 'terrain', mat: 'sand' });
  d.features.push({ type: 'particles', kind: 'dust', count: 1400, box: 50, color: night ? [0.7, 0.65, 0.75] : [1, 0.9, 0.75], size: 0.03, speed: 1.2, wind: [Math.cos(0.35), 0, Math.sin(0.35)], glow: 0.15 });
  d.audio = { base: 'desert', tone: 147, wind: 0.75 };
  d.spawn = { feet: [-28, base(-28, 0) + 0.6, 0], yaw: -Math.PI / 2 };
  void smoothstep; void xf; void qaxis;
  return finish(d, base);
}
