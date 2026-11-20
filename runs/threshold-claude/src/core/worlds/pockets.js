// Pocket worlds: interiors that exist only behind particular doors.
//
//   0,0/hall    The Inner Hall: behind the eight-metre Cell on the platform, a
//               columned hall 160 m long. Its end wall has two windows onto
//               two different worlds (the desert and the glacier).
//   3,0/mirror  The room that contains itself: its east door opens through its
//               own west door; its north window opens through its own ceiling,
//               so you fall back into the room from above.
import { skeleton, finish, xyaw, xf } from '../worldgen.js';
import { makePortal } from '../portal.js';
import { frameParts } from '../frames.js';
import { qaxis, qfromBasis } from '../math.js';

export const POCKET_DOORS = {
  hall: { hw: 1.15, hh: 1.75, style: 'gate' },
  hallwin: { hw: 2.2, hh: 4.2, style: 'gate', sill: 0.5 },
  mirror: { hw: 1.1, hh: 1.8, style: 'collar' },
  tilt: { hw: 1.1, hh: 1.8, style: 'collar' },
};

// Axis-aligned wall slab in the XY plane (at z) or the ZY plane (at x), with
// rectangular openings: { c (centre along the wall), y0, y1, hw }.
function wall(parts, axis, at, a0, a1, y0, y1, thick, openings, mat) {
  const box = (ca, cy, ha, hy) => {
    if (ha <= 0.001 || hy <= 0.001) return;
    const p = axis === 'z' ? [ca, cy, at] : [at, cy, ca];
    const he = axis === 'z' ? [ha, hy, thick / 2] : [thick / 2, hy, ha];
    parts.push({ kind: 'box', xf: xf(p), he, mat, solid: true });
  };
  const ops = [...openings].sort((p, q) => p.c - q.c);
  let cur = a0;
  for (const o of ops) {
    const l = o.c - o.hw, r = o.c + o.hw;
    box((cur + l) / 2, (y0 + y1) / 2, (l - cur) / 2, (y1 - y0) / 2);
    box(o.c, (y0 + o.y0) / 2, o.hw, (o.y0 - y0) / 2);
    box(o.c, (o.y1 + y1) / 2, o.hw, (y1 - o.y1) / 2);
    cur = r;
  }
  box((cur + a1) / 2, (y0 + y1) / 2, (a1 - cur) / 2, (y1 - y0) / 2);
}

export function hallPocket(ctx) {
  const d = skeleton(ctx);
  d.name = 'The Inner Hall';
  d.epithet = 'a hall larger than the room that holds it';
  d.materials.stone = { color: [0.66, 0.58, 0.48], rough: 0.55, detail: 'slabs' };
  d.materials.column = { color: [0.6, 0.55, 0.48], rough: 0.7, detail: 'stone' };
  d.materials.dark = { color: [0.3, 0.27, 0.24], rough: 0.8, detail: 'stone' };
  d.materials.threshold = { color: [0.5, 0.47, 0.43], rough: 0.8, detail: 'stone' };
  d.materials.gold = { color: [0.8, 0.6, 0.3], rough: 0.3, metal: 1.0 };
  const parts = d.parts;
  const H = 34, X = 40, Z0 = -150, Z1 = 9;
  parts.push({ kind: 'box', xf: xf([0, -0.5, (Z0 + Z1) / 2]), he: [X, 0.5, (Z1 - Z0) / 2 + 1], mat: 'stone', solid: true });
  // south wall with the door (gate frame fills the opening)
  const cd = POCKET_DOORS.hall;
  const door = makePortal({ world: d.key, slot: 'door', p: [0, 0.4 + cd.hh, Z1], q: qaxis([0, 1, 0], Math.PI), hw: cd.hw, hh: cd.hh, link: { world: '0,0', slot: 'hall' }, style: 'gate' });
  d.portals.push(door);
  parts.push(...frameParts(door, 'gate', { mat: 'dark' }));
  wall(parts, 'z', Z1, -X, X, 0, H, 0.7, [{ c: 0, y0: 0, y1: 0.4 + 2 * cd.hh + 0.6, hw: cd.hw + 0.45 }], 'dark');
  // north wall with the two windows
  const wn = POCKET_DOORS.hallwin;
  const wins = [['win-a', -12, { world: '1,0', slot: 'hallwin' }], ['win-b', 12, { world: '3,0', slot: 'hallwin' }]];
  const ops = [];
  for (const [slot, x, link] of wins) {
    const P = makePortal({ world: d.key, slot, p: [x, wn.sill + wn.hh, Z0], q: qaxis([0, 1, 0], 0), hw: wn.hw, hh: wn.hh, link, style: 'gate' });
    d.portals.push(P);
    parts.push(...frameParts(P, 'gate', { mat: 'dark' }));
    ops.push({ c: x, y0: wn.sill - 0.4, y1: wn.sill + 2 * wn.hh + 0.6, hw: wn.hw + 0.45 });
  }
  wall(parts, 'z', Z0, -X, X, 0, H, 0.7, ops, 'dark');
  wall(parts, 'x', -X, Z0, Z1, 0, H, 1.2, [], 'dark');
  wall(parts, 'x', X, Z0, Z1, 0, H, 1.2, [], 'dark');
  // colonnades, architraves, and a roof of beams with slots for the sun
  const rows = [-25, -11, 11, 25];
  for (const x of rows) {
    for (let z = Z0 + 12; z <= Z1 - 12; z += 16) {
      parts.push({ kind: 'cyl', xf: xf([x, 0.6, z]), r: 2.4, h: 1.2, seg: 8, mat: 'column', solid: true });
      parts.push({ kind: 'cyl', xf: xf([x, 1.2 + 14.4, z]), r1: 1.6, r: 1.9, h: 28.8, seg: 24, mat: 'column', solid: true });
      parts.push({ kind: 'box', xf: xf([x, 30.6, z]), he: [2.3, 0.6, 2.3], mat: 'column', solid: true });
    }
    parts.push({ kind: 'box', xf: xf([x, 32, (Z0 + Z1) / 2]), he: [1.8, 0.9, (Z1 - Z0) / 2], mat: 'dark', solid: true });
  }
  const strips = [[-X, -19.75], [-16.25, -1.75], [1.75, 16.25], [19.75, X]];
  for (const [a, b] of strips) parts.push({ kind: 'box', xf: xf([(a + b) / 2, H + 0.8, (Z0 + Z1) / 2]), he: [(b - a) / 2, 0.8, (Z1 - Z0) / 2 + 1], mat: 'dark', solid: true });
  // a low dais before the windows
  parts.push({ kind: 'box', xf: xf([0, 0.15, Z0 + 9]), he: [22, 0.15, 7], mat: 'stone', solid: true });
  parts.push({ kind: 'cyl', xf: xf([0, 1.2, Z0 + 9]), r: 1.2, h: 2.1, seg: 6, mat: 'dark', solid: true });
  d.lodestone = { p: [0, 2.3, Z0 + 9], yaw: 0, kind: 'orb' };
  d.landmarks.push({ id: 'windows', name: 'The Two Windows', p: [0, 0, Z0], note: 'In one wall, two windows: one opens on a desert at night, the other on a glacier at noon.' });
  d.features.push({ type: 'shafts', slots: [-18, 0, 18], z0: Z0, z1: Z1, y: H, width: 3.5 });

  const sun = [0.28, 0.86, 0.42];
  d.atmos = { fogColor: [0.13, 0.1, 0.08], sunDir: sun, sunColor: [2.6, 1.95, 1.3], fogDensity: 0.0045, fogFalloff: 0.012, fogBase: 0, inscatter: 1.3 };
  d.sky = { zenith: [0.2, 0.32, 0.55], horizon: [0.8, 0.7, 0.55], ground: [0.3, 0.25, 0.2], sunSize: 0.012, sunGlow: 1.4, sunDisc: 22, moons: [], stars: 0, aurora: 0, clouds: 0.3, cloudScale: 0.5, cloudColor: [1, 0.95, 0.88] };
  d.light = { sun: 6.5, hemi: 0.14, hemiSky: [0.5, 0.42, 0.34], hemiGround: [0.3, 0.22, 0.15], env: 0.16, shadowRange: 80 };
  d.post = { exposure: 0.92, saturation: 1.05, contrast: 1.1, lift: [0.01, 0.005, 0.0], gain: [1.03, 1.0, 0.95], bloom: 0.55 };
  d.fill = [0.34, 0.27, 0.2];
  d.features.push({ type: 'particles', kind: 'motes', count: 1400, box: 40, color: [1.0, 0.82, 0.55], size: 0.035, speed: 0.08, glow: 0.9 });
  d.audio = { base: 'hall', tone: 131, wind: 0.08, reverb: 1 };
  d.killHeight = -50;
  d.spawn = { feet: [0, 0.4, Z1 - 3], yaw: 0 };
  return finish(d, null);
}

export function mirrorPocket(ctx) {
  const d = skeleton(ctx);
  d.name = 'The Room That Contains Itself';
  d.epithet = 'a chamber whose doors open into itself';
  d.materials.stone = { color: [0.55, 0.5, 0.45], rough: 0.6, detail: 'slabs' };
  d.materials.wallM = { color: [0.42, 0.4, 0.38], rough: 0.85, detail: 'concrete' };
  d.materials.threshold = { color: [0.3, 0.29, 0.28], rough: 0.7, detail: 'stone' };
  d.materials.brass = { color: [0.75, 0.52, 0.25], rough: 0.3, metal: 1.0 };
  d.materials.flame = { color: [0.05, 0.05, 0.05], emissive: [1.0, 0.62, 0.3], emissiveIntensity: 7, castShadow: false };
  const parts = d.parts, R = 7, H = 9, T = 1.0;
  parts.push({ kind: 'box', xf: xf([0, -0.5, 0]), he: [R + T, 0.5, R + T], mat: 'stone', solid: true });
  const md = POCKET_DOORS.mirror;
  const doorW = { hw: 1.3, hh: 2.2 }, win = { hw: 1.1, hh: 1.1, sill: 1.0 };
  const P = (slot, p, q, s, link) => { const x = makePortal({ world: d.key, slot, p, q, hw: s.hw, hh: s.hh, link, style: 'collar' }); d.portals.push(x); parts.push(...frameParts(x, 'collar', { mat: 'threshold' })); return x; };
  P('door', [0, md.hh, R + T / 2], qaxis([0, 1, 0], Math.PI), md, { world: '3,0', slot: 'mirror' });
  P('self-e', [R + T / 2, doorW.hh, 0], qaxis([0, 1, 0], -Math.PI / 2), doorW, { world: d.key, slot: 'self-w' });
  P('self-w', [-R - T / 2, doorW.hh, 0], qaxis([0, 1, 0], Math.PI / 2), doorW, { world: d.key, slot: 'self-e' });
  P('win', [0, win.sill + win.hh, -R - T / 2], qaxis([0, 1, 0], 0), win, { world: d.key, slot: 'sky' });
  const skyQ = qfromBasis([-1, 0, 0], [0, 0, -1], [0, -1, 0]);
  P('sky', [0, H + T / 2, 0], skyQ, win, { world: d.key, slot: 'win' });
  const jw = 0.35;
  wall(parts, 'z', R + T / 2, -R - T, R + T, 0, H, T, [{ c: 0, y0: 0, y1: 2 * md.hh + jw, hw: md.hw + jw }], 'wallM');
  wall(parts, 'z', -R - T / 2, -R - T, R + T, 0, H, T, [{ c: 0, y0: win.sill - jw, y1: win.sill + 2 * win.hh + jw, hw: win.hw + jw }], 'wallM');
  wall(parts, 'x', R + T / 2, -R, R, 0, H, T, [{ c: 0, y0: 0, y1: 2 * doorW.hh + jw, hw: doorW.hw + jw }], 'wallM');
  wall(parts, 'x', -R - T / 2, -R, R, 0, H, T, [{ c: 0, y0: 0, y1: 2 * doorW.hh + jw, hw: doorW.hw + jw }], 'wallM');
  // the ceiling, with a square hole for the skylight (collar fills it)
  const k = win.hw + jw;
  for (const [cx, cz, hx, hz] of [[0, -(R + k) / 2 - T / 4, R + T, (R - k) / 2 + T / 2], [0, (R + k) / 2 + T / 4, R + T, (R - k) / 2 + T / 2], [-(R + k) / 2 - T / 4, 0, (R - k) / 2 + T / 2, k], [(R + k) / 2 + T / 4, 0, (R - k) / 2 + T / 2, k]]) {
    parts.push({ kind: 'box', xf: xf([cx, H + T / 2, cz]), he: [hx, T / 2, hz], mat: 'wallM', solid: true });
  }
  // steps up to the window ledge
  parts.push({ kind: 'box', xf: xf([0, 0.25, -R + 2.0]), he: [2.0, 0.25, 0.5], mat: 'stone', solid: true });
  parts.push({ kind: 'box', xf: xf([0, 0.5, -R + 0.75]), he: [2.0, 0.5, 0.75], mat: 'stone', solid: true });
  // braziers in the corners
  for (const [x, z] of [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]]) {
    parts.push({ kind: 'cyl', xf: xf([x, 0.6, z]), r: 0.25, r1: 0.18, h: 1.2, seg: 10, mat: 'brass', solid: true });
    parts.push({ kind: 'sphere', xf: xf([x, 1.35, z]), r: 0.22, seg: 12, mat: 'flame', solid: false });
    d.lights.push({ p: [x, 1.8, z], color: [1.0, 0.62, 0.32], intensity: 22, range: 18 });
  }
  d.lodestone = { p: [-3.6, 0.0, 4.4], yaw: 0, kind: 'ring' };
  d.landmarks.push({ id: 'self', name: 'The East and West Doors', p: [0, 0, 0], note: 'Walk out of the east door and you walk in by the west.' });
  d.landmarks.push({ id: 'skylight', name: 'The Window in the Ceiling', p: [0, H, 0], note: 'The north window opens onto the room from above.' });
  d.atmos = { fogColor: [0.08, 0.06, 0.05], sunDir: [0.2, 0.9, 0.3], sunColor: [0.0, 0.0, 0.0], fogDensity: 0.004, fogFalloff: 0.02, fogBase: 0, inscatter: 0.0 };
  d.sky = { zenith: [0.02, 0.02, 0.03], horizon: [0.05, 0.04, 0.04], ground: [0.02, 0.02, 0.02], sunSize: 0.01, sunGlow: 0, sunDisc: 0, moons: [], stars: 0, aurora: 0, clouds: 0, cloudScale: 0.5, cloudColor: [0, 0, 0] };
  d.light = { sun: 0.0, hemi: 0.35, hemiSky: [0.4, 0.34, 0.3], hemiGround: [0.2, 0.15, 0.1], env: 0.2, shadows: false };
  d.post = { exposure: 1.3, saturation: 1.05, contrast: 1.05, lift: [0.01, 0.005, 0.0], gain: [1.02, 1.0, 0.96], bloom: 0.7 };
  d.fill = [0.12, 0.09, 0.07];
  d.features.push({ type: 'particles', kind: 'motes', count: 300, box: 14, color: [1.0, 0.75, 0.45], size: 0.03, speed: 0.05, glow: 0.8 });
  d.audio = { base: 'room', tone: 110, wind: 0.0, reverb: 1 };
  d.killHeight = -60;
  d.spawn = { feet: [0, 0, R - 2], yaw: 0 };
  void xyaw;
  return finish(d, null);
}

// The Leaning Room (1,0/tilt): its doorway is rolled a quarter turn relative
// to the desert door that leads to it. Seen from the desert, the room lies on
// its side (its floor stands as a wall); walk through and you arrive lying
// sideways, and the room's gravity turns you upright onto its floor.
export function tiltPocket(ctx) {
  const d = skeleton(ctx);
  d.name = 'The Leaning Room';
  d.epithet = 'a room that is the right way up only from inside';
  d.materials.stone = { color: [0.5, 0.46, 0.42], rough: 0.6, detail: 'slabs' };
  d.materials.wallM = { color: [0.36, 0.38, 0.42], rough: 0.85, detail: 'concrete' };
  d.materials.threshold = { color: [0.3, 0.29, 0.28], rough: 0.7, detail: 'stone' };
  d.materials.cloth = { color: [0.42, 0.08, 0.06], rough: 0.95 };
  d.materials.brass = { color: [0.75, 0.52, 0.25], rough: 0.3, metal: 1.0 };
  d.materials.flame = { color: [0.05, 0.05, 0.05], emissive: [1.0, 0.62, 0.3], emissiveIntensity: 7, castShadow: false };
  const parts = d.parts, R = 6, H = 7, T = 1.0, td = POCKET_DOORS.tilt, jw = 0.35;
  parts.push({ kind: 'box', xf: xf([0, -0.5, 0]), he: [R + T, 0.5, R + T], mat: 'stone', solid: true });
  parts.push({ kind: 'box', xf: xf([0, H + T / 2, 0]), he: [R + T, T / 2, R + T], mat: 'wallM', solid: true });
  // the door, rolled: its local up runs along -Z, its local x points down
  const q = qfromBasis([0, -1, 0], [0, 0, -1], [1, 0, 0]);
  const cy = jw + td.hw;
  const P = makePortal({ world: d.key, slot: 'door', p: [-R - T / 2, cy, 0], q, hw: td.hw, hh: td.hh, link: { world: '1,0', slot: 'tilt' }, style: 'collar' });
  d.portals.push(P);
  parts.push(...frameParts(P, 'collar', { mat: 'threshold' }));
  wall(parts, 'x', -R - T / 2, -R, R, 0, H, T, [{ c: 0, y0: 0, y1: cy + td.hw + jw, hw: td.hh + jw }], 'wallM');
  wall(parts, 'x', R + T / 2, -R, R, 0, H, T, [], 'wallM');
  wall(parts, 'z', R + T / 2, -R - T, R + T, 0, H, T, [], 'wallM');
  wall(parts, 'z', -R - T / 2, -R - T, R + T, 0, H, T, [], 'wallM');
  // furniture that makes "down" unmistakable: a long carpet, a table, a lamp hanging on its chain
  parts.push({ kind: 'box', xf: xf([0, 0.01, 0]), he: [R - 1, 0.01, 1.2], mat: 'cloth', solid: false });
  parts.push({ kind: 'box', xf: xf([1.5, 0.8, 0]), he: [1.8, 0.06, 0.7], mat: 'stone', solid: true });
  for (const [x, z] of [[0, -0.55], [0, 0.55], [3, -0.55], [3, 0.55]]) parts.push({ kind: 'box', xf: xf([x, 0.38, z]), he: [0.06, 0.38, 0.06], mat: 'brass', solid: true });
  parts.push({ kind: 'cyl', xf: xf([1.5, H - 1.6, 0]), r: 0.015, h: 3.2, seg: 6, mat: 'brass', solid: false });
  parts.push({ kind: 'sphere', xf: xf([1.5, H - 3.3, 0]), r: 0.22, seg: 14, mat: 'flame', solid: false });
  d.lights.push({ p: [1.5, H - 3.5, 0], color: [1.0, 0.65, 0.35], intensity: 26, range: 16 });
  for (const z of [-3.5, 3.5]) parts.push({ kind: 'cyl', xf: xf([4.5, H / 2, z]), r: 0.35, h: H, seg: 16, mat: 'stone', solid: true });
  d.landmarks.push({ id: 'lean', name: 'The Leaning Room', p: [0, 0, 0], note: 'Seen through its door, the room lies on its side. Inside, it is the world that leans.' });
  d.atmos = { fogColor: [0.08, 0.06, 0.05], sunDir: [0.2, 0.9, 0.3], sunColor: [0, 0, 0], fogDensity: 0.004, fogFalloff: 0.02, fogBase: 0, inscatter: 0.0 };
  d.sky = { zenith: [0.02, 0.02, 0.03], horizon: [0.05, 0.04, 0.04], ground: [0.02, 0.02, 0.02], sunSize: 0.01, sunGlow: 0, sunDisc: 0, moons: [], stars: 0, aurora: 0, clouds: 0, cloudScale: 0.5, cloudColor: [0, 0, 0] };
  d.light = { sun: 0.0, hemi: 0.4, hemiSky: [0.42, 0.38, 0.34], hemiGround: [0.2, 0.16, 0.12], env: 0.2, shadows: false };
  d.post = { exposure: 1.25, saturation: 1.05, contrast: 1.05, lift: [0.01, 0.005, 0.0], gain: [1.02, 1.0, 0.96], bloom: 0.6 };
  d.fill = [0.12, 0.09, 0.07];
  d.audio = { base: 'room', tone: 123, wind: 0.0, reverb: 1 };
  d.killHeight = -60;
  d.spawn = { feet: [-2, 0, 0], yaw: -Math.PI / 2 };
  return finish(d, null);
}
