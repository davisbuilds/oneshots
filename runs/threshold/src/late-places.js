import * as T from '../vendor/three.module.js';
import { shape, shade, arch } from './sculpt.js';
import { ground, random } from './geography.js';
import { barrier } from './spatial.js';
import { stone } from './places.js';
const PI = Math.PI;
export function ice(m, info) {
  const p = stone.ice,
    rng = random(info.seed + 17);
  const crystal = shape('cleaved-quartz', () => {
    const pos = [],
      colors = [],
      idx = [],
      N = 7;
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < N; i++) {
        const a = (i * PI * 2) / N,
          r = [1, 0.88, 0.67, 0.53, 0.026][j] * (1 + 0.12 * Math.sin(i * 8.2));
        pos.push(
          r * Math.cos(a) + (0.25 * j) / 4,
          [-0.5, -0.27, 0.14, 0.31, 0.52][j] + (j === 3 ? 0.12 * Math.sin(a) : 0),
          r * Math.sin(a)
        );
        const k = 0.63 + 0.24 * (0.5 + 0.5 * Math.cos(i * 2.5)) + 0.06 * j;
        colors.push(k * 0.8, k * 0.94, k);
        if (j) {
          const q = j * N + i,
            l = j * N + ((i + 1) % N);
          idx.push(q - N, q, l - N, l - N, q, l);
        }
      }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    g.setIndex(idx);
    const faceted = g.toNonIndexed();
    faceted.computeVertexNormals();
    return faceted;
  });
  for (let i = 0; i < 105; i++) {
    const side = i % 2 ? 1 : -1,
      x = side * (13 + rng() ** 1.4 * 84),
      z = (rng() - 0.57) * 133,
      h = 4 + rng() ** 1.5 * 21;
    if (info.gates.some((g) => Math.hypot(x - g.origin.x, z - g.origin.z) < 6)) continue;
    info.barriers.push(barrier(x, z, 1.1 + h * 0.24, 1.1 + h * 0.18));
    m.place(
      crystal,
      'living',
      shade(i % 3 ? '#93b7c5' : '#bfd8de', 0.83 + 0.24 * rng()),
      x,
      ground(info, x, z) + h * 0.42,
      z,
      1 + h * 0.18,
      h,
      1 + h * 0.12,
      [0.14 * (rng() - 0.5), rng() * PI, (rng() - 0.5) * 0.49]
    );
  }
  for (let k = 0; k < 13; k++) {
    const t = k / 12,
      rad = 4.6 + 5.7 * t;
    m.cylinder(-9, 8 + k * 1.48, -50, rad, 0.78, rad * 0.78, k % 3 ? p[0] : p[1]);
    m.cylinder(-9, 8.69 + k * 1.48, -50, rad * 0.83, 0.74, rad * 0.67, p[2]);
    if (k % 3 === 0)
      m.cylinder(-9, 8.43 + k * 1.48, -50, rad * 0.97, 0.11, rad * 0.74, '#b3e5e4', null, 'light');
  }
  m.cone(-9, 4, -50, 3.1, 12, 3.1, p[2]);
  m.ring(-9, 28, -50, 3.6, 0.21, p[3], [0, 0.4, 0]);
  // The meridian is an inhabited instrument, its comb of fins cut along one axis.
  for (let i = 0; i < 17; i++) {
    const z = -38 + i * 3.4,
      x = -24 + Math.sin(i * 0.21) * 4,
      h = 7 + 9 * (0.5 + 0.5 * Math.cos(i * 0.3));
    m.box(x, h * 0.5 - 1, z, 2, h, 1.3, p[2], [0, 0, -0.175]);
    m.box(x + 1.2, h - 0.7, z, 6, 0.66, 1.43, p[1], [0, 0, -0.175]);
    m.box(x + 1.15, h * 0.63, z + 0.68, 0.085, h * 0.49, 0.08, '#c7fbff', [0, 0, -0.175], 'light');
  }
  for (let i = 0; i < 11; i++) m.box(-26, 16.7 - i * 0.08, -33 + i * 3.4, 5.2, 0.87, 3.45, p[0]);
}
export function archive(m, info) {
  const p = stone.archive,
    rng = random(info.seed);
  m.box(0, -0.45, 0, 43, 0.86, 54, p[2]);
  for (let z = 0; z < 26; z++)
    for (let x = 0; x < 18; x++) {
      m.box(
        (x - 8.5) * 2.36,
        -0.075,
        (z - 12.5) * 2.05,
        2.345,
        0.14,
        2.035,
        shade((x + z) % 4 ? p[0] : p[1], 0.8 + 0.11 * rng())
      );
    }
  for (const x of [-20.7, 20.7]) {
    m.box(x, 7.3, 0, 1.2, 15, 53, p[2]);
    info.barriers.push(barrier(x, 0, 1.2, 53));
    for (let z = -24; z <= 24; z += 4.8) {
      m.box(x * 0.98, 6, z, 1.9, 12, 1.07, p[0]);
      for (let j = 0; j < 11; j++) m.box(x * 0.965, 0.8 + j * 0.94, z + 2.35, 1.83, 0.19, 3.7, p[1]);
    }
  }
  for (const z of [-26, 26]) {
    m.box(0, 7.3, z, 42, 15, 1, p[2]);
    info.barriers.push(barrier(0, z, 42, 1));
    for (let i = -3; i <= 3; i++) {
      m.box(i * 5.4, 7.5, z * 0.987, 2.9, 9, 0.7, p[0]);
      m.box(i * 5.4, 7.5, z * 0.966, 0.075, 7, 0.09, p[3], null, 'metal');
    }
  }
  // Two openings in one screen wall, plus the through aisle in the west.
  for (const [x, w] of [
    [-17.2, 6.1],
    [-3.5, 2.8],
    [7.55, 1.1],
    [18.8, 3.2],
  ]) {
    m.box(x, 4.4, -22, w, 8.8, 1.1, p[0]);
    info.barriers.push(barrier(x, -22, w, 1.1));
  }
  m.box(0.1, 10.0, -22, 41.2, 2.5, 1.45, p[1]);
  for (const x of [-15.6, -4.8, 8.5, 17.1])
    for (const z of [-15, -5, 5, 15]) {
      if (x === -4.8 && z === 5) continue;
      m.cylinder(x, 5.72, z, 0.59, 11.45, 0.59, p[0]);
      m.cylinder(x, 0.28, z, 0.94, 0.55, 0.94, p[1]);
      m.cylinder(x, 10.94, z, 0.76, 0.36, 0.76, p[3]);
      m.box(x, 11.51, z, 1.79, 0.83, 1.79, p[1]);
      info.barriers.push(barrier(x, z, 1.45, 1.45));
    }
  for (const side of [-1, 1])
    for (let row = 0; row < 7; row++)
      for (let bay = 0; bay < 9; bay++) {
        const z = -21 + bay * 5.0,
          h = 0.95 + row * 1.22;
        for (let i = 0; i < 8; i++) {
          const height = 0.47 + rng() * 0.49;
          const c = ['#615a4c', '#8b795c', '#725d50', '#667063'][i % 4];
          m.box(
            side * 19.63,
            h + height * 0.5,
            z + i * 0.43,
            0.4,
            height,
            0.29 + rng() * 0.08,
            c,
            [0, 0, 0]
          );
        }
        if (row === 2 && bay % 2 === 0) {
          m.box(side * 18.96, 3.8, z, 0.55, 0.15, 0.55, p[3], null, 'metal');
          m.cylinder(side * 18.96, 4.07, z, 0.12, 0.5, 0.12, '#ffcf80', null, 'light');
        }
      }
  for (const x of [-10.82, -7.98]) m.box(x, 0.014, 0, 0.034, 0.017, 45, p[3], null, 'metal');
  for (let z = -21; z < 24; z += 5) {
    m.box(0, 12.7, z, 42, 0.76, 0.85, p[0]);
    m.box(0, 13.14, z, 42, 0.16, 1.15, p[1]);
  }
  m.box(-14, 13.5, 0, 13, 0.8, 54, p[2]);
  m.box(14, 13.5, 0, 13, 0.8, 54, p[2]);
  for (const r of [3.8, 3.52, 2.8]) m.ring(0, 9.8, 1, r, 0.095, p[3], [PI / 2, 0.22, r * 0.34]);
  for (let i = 0; i < 18; i++) {
    const a = (i * PI) / 9;
    m.beam(
      [Math.sin(a) * 3.76, 9.8, 1 + Math.cos(a) * 3.76],
      [Math.sin(a) * 3.76, 12.7, 1 + Math.cos(a) * 3.76],
      0.027,
      p[3],
      'metal'
    );
  }
}
export function chapel(m, g) {
  m.frame.copy(g.frame);
  const p = stone.ocean;
  m.box(0, 8.95, -0.82, 10.2, 0.6, 3.55, p[0]);
  m.box(0, 9.34, -0.82, 10.65, 0.2, 3.95, p[1]);
  for (const s of [-1, 1]) m.box(s * 4.61, 4.3, -0.78, 1.05, 8.6, 3.17, p[2]);
  m.frame.identity();
}
export function resonator(m, info) {
  const [x, z] = info.beacon,
    y = ground(info, x, z),
    p = stone[info.biome];
  m.cylinder(x, y + 0.14, z, 0.62, 0.28, 0.62, p[2]);
  m.cylinder(x, y + 0.34, z, 0.48, 0.12, 0.48, p[3], null, 'metal');
  m.cone(x, y + 0.76, z, 0.37, 0.84, 0.37, p[0]);
  m.cylinder(x, y + 1.19, z, 0.43, 0.12, 0.43, p[1]);
  m.ring(x, y + 1.61, z, 0.37, 0.037, p[3], [0.18, 0.35, 0.15]);
  m.ring(x, y + 1.61, z, 0.31, 0.018, p[3], [-0.45, -0.34, -0.2]);
  info.barriers.push(barrier(x, z, 0.9, 0.9));
}
