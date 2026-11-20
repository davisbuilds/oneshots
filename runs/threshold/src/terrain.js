import * as T from '../vendor/three.module.js';
import { ground, noise } from './geography.js';
import { material } from './sculpt.js';

export const TILE = 32;
const earth = {
  desert: ['#bc7650', '#f1bd86'],
  forest: ['#243e38', '#62735a'],
  ice: ['#738b9a', '#d1e2df'],
};
export function terrainTile(info, cx, cz, steps) {
  const pos = [],
    colors = [],
    idx = [];
  const a = new T.Color(earth[info.biome][0]),
    b = new T.Color(earth[info.biome][1]),
    c = new T.Color();
  for (let j = 0; j <= steps; j++)
    for (let i = 0; i <= steps; i++) {
      const x = (cx + i / steps) * TILE,
        z = (cz + j / steps) * TILE,
        y = ground(info, x, z);
      pos.push(x, y - 0.035, z);
      const dune = noise(x * 0.085, z * 0.085, info.seed),
        stripes = Math.sin(z * 1.35 + x * 0.64 + 3 * dune);
      c.copy(a).lerp(b, 0.22 + 0.57 * dune + 0.07 * stripes);
      colors.push(c.r, c.g, c.b);
      if (i && j) {
        const k = j * (steps + 1) + i;
        idx.push(k - steps - 2, k - 1, k, k - steps - 2, k, k - steps - 1);
      }
    }
  // Skirts conceal the seam between high and low resolution neighbours.
  for (const ids of [
    Array.from({ length: steps + 1 }, (_, i) => i),
    Array.from({ length: steps + 1 }, (_, i) => i * (steps + 1) + steps),
    Array.from({ length: steps + 1 }, (_, i) => steps * (steps + 1) + steps - i),
    Array.from({ length: steps + 1 }, (_, i) => (steps - i) * (steps + 1)),
  ]) {
    let last;
    for (const k of ids) {
      const q = pos.length / 3;
      pos.push(pos[3 * k], pos[3 * k + 1] - 1.6, pos[3 * k + 2]);
      colors.push(...colors.slice(k * 3, k * 3 + 3));
      if (last) idx.push(last[0], k, q, last[0], q, last[1]);
      last = [k, q];
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const normals = geo.getAttribute('normal'),
    normal = new T.Vector3();
  for (let k = 0; k < (steps + 1) ** 2; k++) {
    const x = pos[k * 3],
      z = pos[k * 3 + 2],
      e = 0.12;
    normal
      .set(
        ground(info, x - e, z) - ground(info, x + e, z),
        2 * e,
        ground(info, x, z - e) - ground(info, x, z + e)
      )
      .normalize();
    normals.setXYZ(k, normal.x, normal.y, normal.z);
  }
  geo.computeBoundingSphere();
  const mesh = new T.Mesh(geo, material('living'));
  mesh.receiveShadow = true;
  return mesh;
}

// A coarse outer ring covers the horizon while fine ground streams underfoot.
// Its inside edge shares lattice samples with the outer row of ordinary tiles.
export function horizonTile(info, cx, cz) {
  const steps = 42,
    half = 10,
    cell = TILE / 2,
    pos = [],
    idx = [],
    colors = [];
  const a = new T.Color(earth[info.biome][0]),
    b = new T.Color(earth[info.biome][1]),
    c = new T.Color();
  for (let j = 0; j <= steps; j++)
    for (let i = 0; i <= steps; i++) {
      const x = (cx - half) * TILE + i * cell,
        z = (cz - half) * TILE + j * cell;
      pos.push(x, ground(info, x, z) - 0.06, z);
      c.copy(a).lerp(b, 0.22 + 0.57 * noise(x * 0.085, z * 0.085, info.seed));
      colors.push(c.r, c.g, c.b);
      if (i && j && !(i > 16 && i <= 26 && j > 16 && j <= 26)) {
        const k = j * (steps + 1) + i;
        idx.push(k - steps - 2, k - 1, k, k - steps - 2, k, k - steps - 1);
      }
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new T.Mesh(g, material('living'));
}
