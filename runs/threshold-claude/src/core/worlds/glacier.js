// Glacier: a frozen megastructure. Colossal brutalist forms rise from an ice
// plain under a low polar sun: a vault with a deep slot at its foot, stepped
// towers, long walls and a cantilevered beam. Snow falls. The curated world
// (3,0) holds the doorway to the room that contains itself.
import { skeleton, addDoor, finish, hsl, xyaw, xf, BEARING, bearingVec, siteClearance, doorClearance, spreadBearing, scaleRGB, mixRGB } from '../worldgen.js';
import { fbm2, ridged2, rng } from '../rng.js';
import { norm } from '../math.js';
import { makePortal } from '../portal.js';
import { frameParts } from '../frames.js';
import { qaxis } from '../math.js';
import { POCKET_DOORS } from './pockets.js';

export function glacier(ctx) {
  const d = skeleton(ctx);
  const R = rng(ctx.seed);
  const curated = ctx.key === '3,0';
  d.name = curated ? 'Isenholm' : ctx.name;
  d.epithet = curated ? 'the frozen megastructure' : R.pick(['a city under the ice', 'the frozen vaults', 'the white architecture', 'a glacier of monuments']);
  const base = (x, z) => fbm2(x / 400, z / 400, ctx.seed, 4) * 10 + ridged2(x / 160, z / 160, ctx.seed + 3, 3) * 6;
  const tint = curated ? 205 : R.range(180, 240);
  d.materials.snow = { color: [0.82, 0.86, 0.92], rough: 0.7, detail: 'snow' };
  d.materials.ice = { color: hsl(tint, 0.35, 0.55), rough: 0.25, metal: 0.0, detail: 'ice' };
  d.materials.concrete = { color: [0.46, 0.48, 0.52], rough: 0.9, detail: 'concrete', snowCap: true };
  d.materials.concreteDark = { color: [0.24, 0.26, 0.3], rough: 0.9, detail: 'concrete', snowCap: true };
  d.materials.threshold = { color: [0.38, 0.4, 0.44], rough: 0.85, detail: 'concrete' };
  d.materials.lamp = { color: [0.05, 0.05, 0.05], emissive: hsl(tint - 160, 0.9, 0.6), emissiveIntensity: 5, castShadow: false };

  const center = [0, base(0, 0), 0];
  const box = (p, he, mat = 'concrete', yaw = 0) => d.parts.push({ kind: 'box', xf: xyaw(p, yaw), he, mat, solid: true });
  for (const link of ctx.links) {
    const b = (BEARING[link.slot] ?? R.range(-Math.PI, Math.PI)) + (curated ? 0 : R.range(-0.3, 0.3));
    const dist = link.slot === 'W' ? 32 : (curated ? 150 : R.range(90, 160));
    const v = bearingVec(curated ? b : spreadBearing(d, b, dist));
    const x = v[0] * dist, z = v[2] * dist;
    addDoor(d, link, [x, base(x, z) + 0.5, z], center, { siteR: 8, blend: 14 });
  }

  // ── The Vault: an immense block with a slot cut into its foot.
  let vb = curated ? 0.35 : R.range(-Math.PI, Math.PI), vd = curated ? 95 : R.range(80, 140);
  // the vault must not stand on a doorway's plaza
  for (let k = 0; k < 24 && !curated && doorClearance(d, Math.sin(vb) * vd, -Math.cos(vb) * vd) < 50; k++) { vb = R.range(-Math.PI, Math.PI); vd = R.range(80, 200); }
  const vx = Math.sin(vb) * vd, vz = -Math.cos(vb) * vd, vy = base(vx, vz);
  const yaw = Math.atan2(-vx, -vz); // the slot faces the centre
  const loc = (lx, ly, lz) => [vx + Math.cos(yaw) * lx + Math.sin(yaw) * lz, vy + ly, vz - Math.sin(yaw) * lx + Math.cos(yaw) * lz];
  const W = 34, H = 150, D = 30, slotW = 9, slotH = 22, slotD = 22;
  box(loc(-(slotW / 2 + (W - slotW) / 4), H / 2 - 2, 0), [(W - slotW) / 4, H / 2, D / 2], 'concrete', yaw);
  box(loc(slotW / 2 + (W - slotW) / 4, H / 2 - 2, 0), [(W - slotW) / 4, H / 2, D / 2], 'concrete', yaw);
  box(loc(0, slotH + (H - slotH) / 2 - 2, 0), [slotW / 2, (H - slotH) / 2, D / 2], 'concrete', yaw);
  box(loc(0, slotH / 2 - 2, -D / 2 + (D - slotD) / 2), [slotW / 2, slotH / 2, (D - slotD) / 2], 'concrete', yaw);
  box(loc(0, -1.5, 0), [W / 2 + 4, 1.0, D / 2 + 8], 'concreteDark', yaw);
  for (let k = 0; k < 7; k++) box(loc(0, 8 + k * 19, D / 2 + 0.6), [W / 2 + 0.6, 0.5, 0.6], 'concreteDark', yaw);
  d.sites.push({ p: [vx, vy, vz], r: 30, y: vy - 0.5, blend: 18 });
  d.landmarks.push({ id: 'vault', name: 'The Vault', p: [vx, vy, vz], note: 'A block a hundred and fifty metres tall. At its foot a slot leads to a small door.' });
  // the door to the room that contains itself stands at the back of the slot
  if (curated) {
    const pd = POCKET_DOORS.mirror;
    const fl = loc(0, -0.5, -D / 2 + (D - slotD) + 2.0);
    const P = makePortal({ world: d.key, slot: 'mirror', p: [fl[0], fl[1] + pd.hh, fl[2]], q: qaxis([0, 1, 0], yaw), hw: pd.hw, hh: pd.hh, link: { world: `${ctx.key}/mirror`, slot: 'door' }, style: pd.style });
    d.portals.push(P);
    d.parts.push(...frameParts(P, pd.style, { mat: 'concreteDark', trim: 'lamp' }));
    // the hall's second window stands alone on the ice
    const hw = POCKET_DOORS.hallwin;
    const wx = -46, wz = 38, wy = base(wx, wz) + 0.5;
    const Wp = makePortal({ world: d.key, slot: 'hallwin', p: [wx, wy + hw.hh + hw.sill, wz], q: qaxis([0, 1, 0], Math.atan2(-wx, -wz)), hw: hw.hw, hh: hw.hh, link: { world: '0,0/hall', slot: 'win-b' }, style: 'gate' });
    d.portals.push(Wp);
    d.parts.push(...frameParts(Wp, 'gate', { mat: 'concreteDark', trim: 'lamp' }));
    d.parts.push({ kind: 'box', xf: xyaw([wx, wy + hw.sill / 2 - 0.25, wz], Math.atan2(-wx, -wz)), he: [hw.hw + 0.6, hw.sill / 2 + 0.25, 0.5], mat: 'concreteDark', solid: true });
    d.sites.push({ p: [wx, wy, wz], r: 6, y: wy, blend: 10 });
    d.landmarks.push({ id: 'window', name: 'A Window on the Ice', p: [wx, wy, wz], note: 'A window frame standing alone on the ice. Through it: columns, and warm light.' });
  }

  // ── Towers and walls in a grid around the vault.
  const towers = [];
  for (let k = 0; k < (curated ? 14 : R.int(10) + 8); k++) {
    const a = R.range(-Math.PI, Math.PI), r = R.range(140, 520);
    const x = Math.sin(a) * r, z = -Math.cos(a) * r, y = base(x, z);
    const s = R.range(8, 22), h = R.range(40, 180), steps = 1 + R.int(4), ty = R.range(0, Math.PI / 2);
    if (Math.hypot(x - vx, z - vz) < 70 || doorClearance(d, x, z) < s * 1.75 + 12) continue;
    for (let t = 0; t < steps; t++) {
      const f = 1 - t * 0.22, hh = h / steps;
      box([x, y + hh * t + hh / 2 - 2, z], [s * f, hh / 2, s * f * R.range(0.6, 1.4)], t % 2 ? 'concreteDark' : 'concrete', ty);
    }
    towers.push([x, z]);
    if (R.chance(0.5)) d.parts.push({ kind: 'box', xf: xyaw([x, y + h + 1, z], ty), he: [0.6, 0.6, 0.6], mat: 'lamp', solid: false });
  }
  for (let k = 0; k < 6; k++) {
    const a = R.range(-Math.PI, Math.PI), r = R.range(60, 300);
    const x = Math.sin(a) * r, z = -Math.cos(a) * r, half = R.range(20, 60);
    if (siteClearance(d.sites, x, z) < half + 12 || Math.hypot(x - vx, z - vz) < half + 40) continue;
    box([x, base(x, z) + 4, z], [half, 6, 1.6], 'concreteDark', R.range(0, Math.PI));
  }
  d.landmarks.push({ id: 'towers', name: 'The Stepped Towers', p: towers[0] ? [towers[0][0], 0, towers[0][1]] : [0, 0, 0], note: 'Concrete towers, stepped like ziggurats, rimed with ice.' });

  d.lodestone = { p: [-8, base(-8, -10) + 0.2, -10], yaw: 0.2, kind: 'crystal' };
  d.sites.push({ p: [-8, base(-8, -10), -10], r: 5, y: base(-8, -10), blend: 10 });
  d.clearance = (x, z) => siteClearance(d.sites.filter((s) => s.r > 0), x, z);
  d.scatter.push({ id: 1, kind: 'shard', cell: 14, prob: 0.12, scale: [0.6, 2.2], clear: 8, collide: { r: 0.6, h: 3 }, variants: 4, mat: 'ice' });
  d.scatter.push({ id: 2, kind: 'rock', cell: 20, prob: 0.06, scale: [0.8, 2.5], clear: 8, collide: { r: 0.8, h: 1.2, y0: -0.3 }, variants: 4, mat: 'concreteDark' });

  const sun = curated ? norm([-0.3, 0.26, 0.9]) : norm([-0.75, 0.16, -0.35]);
  d.atmos = { fogColor: [0.5, 0.58, 0.7], sunDir: sun, sunColor: [2.1, 1.7, 1.3], fogDensity: 0.0017, fogFalloff: 0.006, fogBase: 0, inscatter: 0.6 };
  d.sky = { zenith: [0.1, 0.2, 0.42], horizon: [0.62, 0.68, 0.78], ground: [0.6, 0.65, 0.7], sunSize: 0.014, sunGlow: 1.2, sunDisc: 24, moons: [], stars: 0, aurora: 0, clouds: 0.62, cloudScale: 0.5, cloudColor: [0.86, 0.88, 0.93] };
  d.light = { sun: 3.6, hemi: 0.5, hemiSky: [0.45, 0.58, 0.85], hemiGround: [0.42, 0.45, 0.52], env: 0.6, shadowRange: 60 };
  d.post = { exposure: 0.6, saturation: 0.92, contrast: 1.06, lift: [0.0, 0.005, 0.015], gain: [0.98, 1.0, 1.04], bloom: 0.35 };
  d.fill = mixRGB(d.atmos.fogColor, d.sky.horizon, 0.5);
  d.features.push({ type: 'terrain', mat: 'snow' });
  d.features.push({ type: 'particles', kind: 'snow', count: 2200, box: 40, color: [0.95, 0.97, 1.0], size: 0.035, speed: 1.4, wind: [0.6, 0, 0.3], glow: 0.0 });
  d.audio = { base: 'ice', tone: 175, wind: 0.9 };
  d.spawn = { feet: [-28, base(-28, 0) + 0.6, 0], yaw: -Math.PI / 2 };
  void scaleRGB;
  return finish(d, base);
}
