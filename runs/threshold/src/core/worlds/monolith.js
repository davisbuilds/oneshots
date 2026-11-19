// Monolith: impossible brutalism. A concrete datum plane runs to every
// horizon, ruled by a grid of towers, slabs, stairs and bridges that repeats
// forever and never repeats exactly; at the centre stands one block taller
// than the rest.
import { skeleton, finish, hsl, xyaw, ringDoors, siteClearance, mixRGB } from '../worldgen.js';
import { rng } from '../rng.js';
import { norm } from '../math.js';

export const PILLARS = [[6, 30, 6], [14, 14, 3], [4, 55, 10], [10, 22, 10]];

export function monolith(ctx) {
  const d = skeleton(ctx);
  const R = rng(ctx.seed);
  d.epithet = R.pick(['the endless concrete', 'a city with no one in it', 'the grid', 'the architecture of patience']);
  const warm = R.chance(0.5);
  d.materials.concrete = { color: warm ? [0.56, 0.53, 0.5] : [0.5, 0.52, 0.55], rough: 0.9, detail: 'concrete' };
  d.materials.concreteDark = { color: [0.3, 0.3, 0.31], rough: 0.92, detail: 'concrete' };
  d.materials.ground = { color: [0.3, 0.3, 0.3], rough: 0.92, detail: 'slabs' };
  d.materials.threshold = { color: [0.34, 0.34, 0.35], rough: 0.85, detail: 'concrete' };
  d.materials.lamp = { color: [0.05, 0.05, 0.05], emissive: hsl(R.range(0, 360), 0.6, 0.65), emissiveIntensity: 5, castShadow: false };
  d.ground = { kind: 'plane', y: 0, mat: 'ground' };
  const flat = () => 0;
  ringDoors(d, ctx, R, flat, { near: 26, far: [80, 140], lift: 0 });
  // the central monolith
  const H = R.range(260, 420);
  d.parts.push({ kind: 'box', xf: xyaw([0, H / 2, -60], 0), he: [12, H / 2, 6], mat: 'concreteDark', solid: true });
  d.parts.push({ kind: 'box', xf: xyaw([0, 0.6, -60], 0), he: [20, 0.6, 14], mat: 'concrete', solid: true });
  d.parts.push({ kind: 'box', xf: xyaw([0, 12, -53.9], 0), he: [3, 9, 0.1], mat: 'lamp', solid: false });
  d.landmarks.push({ id: 'monolith', name: 'The Monolith', p: [0, 0, -60], note: `A block ${Math.round(H)} metres tall, the only thing here that is not repeated.` });
  // stairs that go nowhere
  for (let k = 0; k < 3; k++) {
    const a = R.range(0, Math.PI * 2), r = R.range(30, 70), x = Math.sin(a) * r, z = -Math.cos(a) * r, yaw = R.range(0, Math.PI);
    if (siteClearance(d.sites, x, z) < 12) continue;
    for (let s = 0; s < 18; s++) {
      const lx = 0, lz = s * 0.6;
      d.parts.push({ kind: 'box', xf: xyaw([x + Math.sin(yaw) * lz + Math.cos(yaw) * lx, 0.15 + s * 0.3, z + Math.cos(yaw) * lz - Math.sin(yaw) * lx], yaw), he: [1.6, 0.15 + s * 0.3 * 0 + 0.0, 0.3], mat: 'concrete', solid: true });
      d.parts.push({ kind: 'box', xf: xyaw([x + Math.sin(yaw) * lz, (0.3 + s * 0.3) / 2, z + Math.cos(yaw) * lz], yaw), he: [1.6, (0.3 + s * 0.3) / 2, 0.3], mat: 'concreteDark', solid: true });
    }
    d.landmarks.push({ id: 'stair' + k, name: 'A Stair to Nowhere', p: [x, 0, z], note: 'Eighteen steps up into the air, and then nothing.' });
  }
  d.lodestone = { p: [10, 1.2, -46], yaw: 0, kind: 'obelisk' };
  d.clearance = (x, z) => Math.min(siteClearance(d.sites, x, z) - 6, Math.hypot(x, z + 60) - 40, Math.hypot(x, z) - 22);
  d.scatter.push({ id: 1, kind: 'pillar', cell: 32, prob: 0.55, scale: [0.6, 1.5], clear: 18, reach: 60, collide: { box: PILLARS.map(([x, y, z]) => [x / 2, y / 2, z / 2]) }, variants: 4, mat: 'concrete' });
  d.scatter.push({ id: 2, kind: 'beam', cell: 64, prob: 0.35, scale: [0.8, 1.3], clear: 44, reach: 60, collide: { box: [[30, 1.5, 3, 14], [3, 1.5, 30, 22]] }, variants: 2, mat: 'concreteDark' });
  const sd = warm ? norm([0.6, 0.35, -0.7]) : norm([-0.3, 0.75, 0.4]);
  d.atmos = { fogColor: warm ? [0.62, 0.58, 0.54] : [0.56, 0.6, 0.66], sunDir: sd, sunColor: warm ? [2.8, 2.2, 1.6] : [2.4, 2.4, 2.4], fogDensity: 0.0016, fogFalloff: 0.004, fogBase: 0, inscatter: 0.6 };
  d.sky = { zenith: warm ? [0.2, 0.25, 0.4] : [0.3, 0.36, 0.46], horizon: d.atmos.fogColor, ground: [0.4, 0.4, 0.4], sunSize: 0.012, sunGlow: 1.0, sunDisc: warm ? 22 : 0, moons: [], stars: 0, aurora: 0, clouds: warm ? 0.3 : 0.85, cloudScale: 0.4, cloudColor: [0.8, 0.8, 0.82] };
  d.light = { sun: warm ? 4.2 : 2.4, hemi: 0.7, hemiSky: [0.6, 0.62, 0.68], hemiGround: [0.42, 0.4, 0.38], env: 0.6, shadowRange: 70 };
  d.post = { exposure: 0.72, saturation: 0.85, contrast: 1.14, lift: [0.0, 0.0, 0.005], gain: [1.0, 1.0, 1.0], bloom: 0.3 };
  d.fill = mixRGB(d.atmos.fogColor, d.sky.horizon, 0.5);
  d.features.push({ type: 'particles', kind: 'dust', count: 700, box: 50, color: [0.9, 0.88, 0.85], size: 0.025, speed: 0.6, wind: [1, 0, 0.2], glow: 0.1 });
  d.audio = { base: 'hum', tone: 82, wind: 0.6 };
  d.heightAt = flat;
  const W = d.portals.find((P) => P.slot === 'W');
  d.spawn = { feet: W ? [W.xf.p[0] * 0.6, 0, W.xf.p[2] * 0.6] : [0, 0, 0], yaw: 0 };
  return finish(d, null);
}
