// The Threshold (0,0): a monumental deck suspended above an endless ocean at
// dawn. Composed as one-point perspective: from the spawn, a colonnade on the
// left and a roofed stoa on the right lead the eye 58 m to the great doorway,
// twelve metres wide and thirty-two tall, through which a desert lies under
// three moons. The low sun at front left backlights the door and lays the
// pillars' shadows across the deck. The stoa loops into itself; a small stone
// cell opens into a hall far larger than the cell; a smaller door leads west;
// behind the great door, where it shows only sea, the lodestone waits.
import { skeleton, addDoor, finish, xyaw, xf } from '../worldgen.js';
import { makePortal } from '../portal.js';
import { frameParts } from '../frames.js';
import { qaxis, norm } from '../math.js';

export const PY = 60;
export const CELL_DOOR = { hw: 1.15, hh: 1.75, style: 'gate' };
export const STOA = { x0: 13.6, x1: 19.4, z0: -22, z1: 22, h: 9 };
const DECK = { x: 20, z0: -46, z1: 40 };

export function hub(ctx) {
  const d = skeleton(ctx);
  d.name = 'The Threshold';
  d.epithet = 'a platform above an endless sea';
  const box = (p, he, mat = 'stone', extra = {}) => d.parts.push({ kind: 'box', xf: xf(p), he, mat, solid: true, ...extra });

  d.materials.stone = { color: [0.6, 0.55, 0.49], rough: 0.8, detail: 'slabs' };
  d.materials.stoneDark = { color: [0.33, 0.31, 0.29], rough: 0.85, detail: 'stone' };
  d.materials.threshold = { color: [0.46, 0.43, 0.4], rough: 0.8, detail: 'stone' };
  d.materials.bronze = { color: [0.55, 0.36, 0.18], rough: 0.35, metal: 0.9 };

  // ── The deck and its stepped underside, tapering to a point above the sea.
  const zc = (DECK.z0 + DECK.z1) / 2, hz = (DECK.z1 - DECK.z0) / 2;
  box([0, PY - 1.5, zc], [DECK.x, 1.5, hz]);
  let y = PY - 3;
  for (const [fx, fz, h] of [[0.9, 0.93, 5], [0.72, 0.8, 8], [0.52, 0.62, 12], [0.32, 0.4, 18], [0.13, 0.15, 24]]) {
    box([0, y - h / 2, zc], [DECK.x * fx, h / 2, hz * fz], 'stoneDark'); y -= h;
  }
  // low curbs along the edges, with gaps where the sea can be approached
  for (const [z0, z1] of [[-45, -26], [-14, 14]]) box([-DECK.x + 0.4, PY + 0.35, (z0 + z1) / 2], [0.4, 0.35, (z1 - z0) / 2], 'stoneDark');
  box([0, PY + 0.35, DECK.z1 - 0.4], [DECK.x - 6, 0.35, 0.4], 'stoneDark');
  box([-8, PY + 0.35, DECK.z0 + 0.4], [12, 0.35, 0.4], 'stoneDark');

  // ── West colonnade: square pillars, bases, capitals, an architrave; one broken.
  const X = -17.2;
  for (let z = -40; z <= 36; z += 8) {
    box([X, PY + 0.35, z], [1.3, 0.35, 1.3]);
    const h = z === -8 ? 6.5 : 15;
    box([X, PY + 0.7 + h / 2, z], [0.95, h / 2, 0.95]);
    if (h > 10) box([X, PY + 0.7 + h + 0.35, z], [1.35, 0.35, 1.35]);
  }
  for (const [z0, z1] of [[-40, -16], [0, 36]]) box([X, PY + 17.2, (z0 + z1) / 2], [1.15, 0.8, (z1 - z0) / 2 + 1.35]);
  d.parts.push({ kind: 'box', xf: xyaw([X + 2.6, PY + 0.95, -6.2], 0.45), he: [0.95, 0.95, 2.6], mat: 'stone', solid: true });
  d.parts.push({ kind: 'box', xf: xf([X + 3.6, PY + 0.55, -10.5], qaxis(norm([0.3, 0.2, 1]), 0.5)), he: [0.95, 0.6, 0.95], mat: 'stone', solid: true });

  // ── The Endless Stoa (east): a roofed walk whose far ends are joined.
  const S = STOA, cx = (S.x0 + S.x1) / 2;
  box([cx, PY + S.h + 0.6, 0], [(S.x1 - S.x0) / 2 + 1.6, 0.6, (S.z1 - S.z0) / 2 + 2.5]);
  for (let z = S.z0 - 1; z <= S.z1 + 1; z += 4.5) box([S.x0 - 0.6, PY + S.h / 2, z], [0.55, S.h / 2, 0.55]);
  for (let z = S.z0 - 2; z < S.z1 + 2; z += 6) {
    const z1 = Math.min(z + 6, S.z1 + 2), zc2 = (z + z1) / 2, hz2 = (z1 - z) / 2;
    box([S.x1 + 0.5, PY + 1.0, zc2], [0.5, 1.0, hz2]);
    box([S.x1 + 0.5, PY + S.h - 1.25, zc2], [0.5, 1.25, hz2]);
    box([S.x1 + 0.5, PY + S.h / 2, z + 0.6], [0.5, S.h / 2 - 1.0, 0.6]);
  }
  box([cx - 0.4, PY + 0.12, 0], [(S.x1 - S.x0) / 2 + 0.6, 0.12, (S.z1 - S.z0) / 2 + 2]);
  const stoaHW = (S.x1 - S.x0) / 2 - 0.5, stoaHH = 3.6;
  const stN = makePortal({ world: d.key, slot: 'stoa-n', p: [cx, PY + 0.24 + stoaHH, S.z0], q: qaxis([0, 1, 0], 0), hw: stoaHW, hh: stoaHH, link: { world: d.key, slot: 'stoa-s' }, style: 'gate' });
  const stS = makePortal({ world: d.key, slot: 'stoa-s', p: [cx, PY + 0.24 + stoaHH, S.z1], q: qaxis([0, 1, 0], Math.PI), hw: stoaHW, hh: stoaHH, link: { world: d.key, slot: 'stoa-n' }, style: 'gate' });
  d.portals.push(stN, stS);
  d.parts.push(...frameParts(stN, 'gate', { mat: 'stone' }), ...frameParts(stS, 'gate', { mat: 'stone' }));
  d.landmarks.push({ id: 'stoa', name: 'The Endless Stoa', p: [cx, PY, 0], note: 'A covered walk forty-four metres long that never ends.' });

  // ── The Cell (west of the axis): a closed stone room; its door opens into a hall.
  const cell = { x: -9.6, z: -6, s: 4 };
  box([cell.x - 0.6, PY + 4, cell.z], [cell.s - 0.6, 4, cell.s], 'stoneDark');
  box([cell.x - 0.6, PY + 8.3, cell.z], [cell.s - 0.2, 0.3, cell.s + 0.4], 'stone');
  const cellDoor = makePortal({ world: d.key, slot: 'hall', p: [cell.x + cell.s - 0.9, PY + 0.4 + CELL_DOOR.hh, cell.z], q: qaxis([0, 1, 0], Math.PI / 2), hw: CELL_DOOR.hw, hh: CELL_DOOR.hh, link: { world: `${ctx.key}/hall`, slot: 'door' }, style: 'gate' });
  d.portals.push(cellDoor);
  d.parts.push(...frameParts(cellDoor, 'gate', { mat: 'stone' }));
  d.landmarks.push({ id: 'cell', name: 'The Cell', p: [cell.x, PY, cell.z], note: 'A stone room seven metres across, with a door into something far larger.' });

  // ── Doorways out into the lattice.
  for (const link of ctx.links) {
    if (link.slot === 'E') addDoor(d, link, [0, PY, -32], [0, PY, 0], { siteR: 0, blend: 0, yaw: 0 });
    else if (link.slot === 'W') addDoor(d, link, [-11, PY, 22], [0, PY, 14], { siteR: 0, blend: 0 });
  }

  // ── The terrace at the south end: you begin four metres above the deck and
  // descend a broad stair towards the door.
  const TZ = 30, TH = 4;
  box([0, PY + TH / 2, (TZ + DECK.z1) / 2], [11, TH / 2, (DECK.z1 - TZ) / 2], 'stone');
  for (let k = 0; k < 8; k++) box([0, PY + (k + 1) * TH / 16, TZ - (8 - k) * 0.9 + 0.45], [7.5, (k + 1) * TH / 16, 0.45], 'stone');
  for (const sx of [-1, 1]) {
    box([sx * 9.25, PY + TH / 2 + 0.6, TZ - 3.4], [1.75, TH / 2 + 0.6, 3.6], 'stoneDark');
    box([sx * 9.25, PY + TH + 1.5, TZ - 0.6], [1.9, 0.3, 1.9], 'stone');
  }
  box([0, PY + TH + 0.5, DECK.z1 - 0.5], [11, 0.5, 0.5], 'stoneDark');
  for (const sx of [-1, 1]) box([sx * 10.5, PY + TH + 0.5, (TZ + DECK.z1) / 2], [0.5, 0.5, (DECK.z1 - TZ) / 2], 'stoneDark');

  // ── The pedestal with the instrument, and the lodestone behind the great door.
  d.parts.push({ kind: 'cyl', xf: xf([2.4, PY + TH + 0.55, 33.2]), r: 0.6, h: 1.1, seg: 24, mat: 'stoneDark', solid: true });
  d.parts.push({ kind: 'cyl', xf: xf([2.4, PY + TH + 1.15, 33.2]), r: 0.75, h: 0.12, seg: 24, mat: 'stone', solid: true });
  d.instrument = { p: [2.4, PY + TH + 1.45, 33.2] };
  d.lodestone = { p: [0, PY, -41], yaw: 0, kind: 'ring' };
  d.landmarks.push({ id: 'behind', name: 'Behind the Great Door', p: [0, PY, -41], note: 'From behind, the great door shows only the sea.' });
  d.spawn = { feet: [0, PY + TH, 36.5], yaw: 0 };

  // ── The sea, and what stands in it.
  d.features.push({ type: 'ocean', y: 0, deep: [0.008, 0.022, 0.04], shallow: [0.025, 0.07, 0.09], glitter: 1.0 });
  d.features.push({ type: 'ring', p: [-700, -60, -1700], r: 160, tube: 10, yaw: 0.5, mat: 'stoneDark' });
  d.features.push({ type: 'stacks', seed: ctx.seed, n: 9, r0: 900, r1: 2600, mat: 'stoneDark' });
  d.features.push({ type: 'floaters', seed: ctx.seed, n: 18, center: [0, PY - 8, -3], r0: 30, r1: 95, y0: -28, y1: 24, mat: 'stoneDark', mat2: 'stone' });
  d.features.push({ type: 'particles', kind: 'motes', count: 700, box: 50, color: [1.0, 0.86, 0.62], size: 0.045, speed: 0.12, glow: 0.5 });

  // ── A gold dawn, the sun low at front left.
  const sun = norm([-0.8, 0.2, -0.56]);
  d.atmos = { fogColor: [0.54, 0.56, 0.61], sunDir: sun, sunColor: [1.9, 1.32, 0.86], fogDensity: 0.0009, fogFalloff: 0.011, fogBase: 0, inscatter: 0.45 };
  d.sky = {
    zenith: [0.06, 0.13, 0.31], horizon: [0.7, 0.64, 0.6], ground: [0.3, 0.33, 0.36],
    sunSize: 0.012, sunGlow: 1.0, sunDisc: 30, moons: [{ dir: norm([0.45, 0.38, -0.8]), size: 0.02, color: [0.82, 0.82, 0.86] }], moonLight: norm([-0.8, 0.2, -0.5]),
    stars: 0.0, aurora: 0, clouds: 0.46, cloudScale: 0.55, cloudColor: [0.96, 0.8, 0.7],
  };
  d.light = { sun: 5.2, hemi: 0.42, hemiSky: [0.42, 0.52, 0.72], hemiGround: [0.36, 0.3, 0.25], env: 0.7, shadowRange: 60 };
  d.fill = [0.75, 0.66, 0.6];
  d.post = { exposure: 0.86, saturation: 1.06, contrast: 1.08, lift: [0.004, 0.006, 0.016], gain: [1.03, 1.0, 0.95], bloom: 0.45 };
  d.audio = { base: 'sea', tone: 196, wind: 0.35, sea: 0.8 };
  d.killHeight = 8;
  return finish(d, null);
}
