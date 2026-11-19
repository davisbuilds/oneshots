import * as T from '../vendor/three.module.js';
import { Masonry, arch, shade, shape } from './sculpt.js';
import { HEIGHT, SPRING, WIDTH, barrier } from './spatial.js';
import { ground, random, noise } from './geography.js';

const PI = Math.PI,
  tau = 2 * PI;
export const stone = {
  ocean: ['#838678', '#b3ac91', '#454f49', '#b69558', '#ffe4a1'],
  desert: ['#ab6646', '#d49a6c', '#794734', '#ac814c', '#ffdfa0'],
  forest: ['#4e6660', '#839883', '#2c4643', '#7d9370', '#a2ffe3'],
  ice: ['#74889b', '#bbcbce', '#424e68', '#a69b87', '#d4f6ff'],
  archive: ['#868176', '#c1b39a', '#484940', '#a58a52', '#ffe2a1'],
};
function pier(m, x, z, h, s, p) {
  m.box(x, 0.23, z, s * 1.52, 0.46, s * 1.54, p[2]);
  m.box(x, 0.55, z, s * 1.36, 0.18, s * 1.4, p[1]);
  m.box(x, h * 0.5 + 0.32, z, s, h - 0.45, s, p[0]);
  m.box(x, h - 0.25, z, s * 1.15, 0.23, s * 1.15, p[1]);
  m.box(x, h, z, s * 1.34, 0.26, s * 1.34, p[0]);
}
export function gatehouse(m, g, info) {
  const p = stone[info.biome],
    rnd = random(info.seed + g.key.charCodeAt(0));
  m.frame.copy(g.frame);
  const special = info.biome === 'ocean' && g.key === 'front';
  for (const s of [-1, 1]) {
    const x = s * (WIDTH / 2 + 0.55);
    for (let j = 0; j < 8; j++) {
      m.box(
        x,
        ((j + 0.5) * SPRING) / 8,
        0,
        1.1,
        SPRING / 8 - 0.014,
        1.58,
        shade(p[0], 0.89 + 0.18 * rnd())
      );
      if (j === 1 || j === 7) m.box(x, ((j + 0.94) * SPRING) / 8, 0, 1.25, 0.115, 1.72, p[1]);
    }
    for (const face of [-1, 1]) {
      m.box(s * 3.065, SPRING / 2, face * 0.81, 0.116, SPRING, 0.07, p[3], null, 'metal');
      m.box(s * 3.07, SPRING / 2, face * 0.856, 0.032, SPRING, 0.025, p[4], null, 'light');
    }
    // Outer buttresses, recessed flutes and cut brass survey marks.
    const bx = s * (special ? 4.67 : 4.29),
      bh = special ? 8.25 : 5.1;
    pier(m, bx, 0, bh, special ? 1.5 : 1.02, p);
    for (let j = -1; j <= 1; j++) {
      m.box(bx + j * 0.29, bh * 0.48, 0.78, 0.055, bh * 0.72, 0.043, p[2]);
      m.box(bx + j * 0.29, bh * 0.48, -0.78, 0.055, bh * 0.72, 0.043, p[2]);
    }
    if (special) {
      for (let j = 0; j < 4; j++)
        m.box(bx, bh + 0.17 + j * 0.19, 0, 1.59 - j * 0.19, 0.21, 1.69 - j * 0.17, p[j % 2]);
      m.cone(bx, bh + 1.53, 0, 0.37, 1.23, 0.37, p[2]);
      m.orb(bx, bh + 2.15, 0, 0.12, 0.12, 0.12, p[3]);
      for (const face of [-1, 1]) {
        m.box(bx, 4.5, face * 0.79, 0.46, 1.28, 0.08, p[2]);
        for (let j = 0; j < 6; j++)
          m.box(bx, 4.15 + j * 0.13, face * 0.845, 0.14 + (j % 3) * 0.07, 0.026, 0.02, p[3], null, 'metal');
      }
    }
  }
  arch(m, 0, SPRING, 0, 3, 4.03, 1.58, 23, p[0]);
  arch(m, 0, SPRING, 0, 3.99, 4.21, 1.76, 27, p[1]);
  for (const side of [-1, 1]) {
    arch(m, 0, SPRING, side * 0.82, 3.005, 3.14, 0.12, 41, p[3], 'metal');
    arch(m, 0, SPRING, side * 0.894, 3.018, 3.043, 0.021, 41, p[4], 'light');
  }
  m.box(0, HEIGHT + 0.66, 0, 0.75, 1.04, 1.88, p[1]);
  m.box(0, HEIGHT + 1.16, 0, 1.21, 0.145, 1.94, p[0]);
  m.frame.identity();
  const angle = Math.atan2(g.normal.x, g.normal.z);
  for (const s of [-1, 1]) {
    const v = new T.Vector3(s * 3.99, 0, 0).applyMatrix4(g.frame);
    info.barriers.push(barrier(v.x, v.z, 1.98, 1.87, angle));
    if (special) {
      const base = new T.Vector3(s * 4.67, 0, 0).applyMatrix4(g.frame);
      info.barriers.push(barrier(base.x, base.z, 2.28, 2.31, angle));
    }
  }
}
function mesaGeo() {
  return shape('eroded-butte', () => {
    const pos = [],
      colors = [],
      idx = [],
      n = 28;
    const strata = [
      [0, 1.16],
      [0.15, 1.05],
      [0.24, 0.92],
      [0.36, 0.89],
      [0.38, 0.94],
      [0.42, 0.91],
      [0.49, 0.87],
      [0.51, 0.9],
      [0.57, 0.84],
      [0.73, 0.8],
      [0.75, 0.84],
      [0.8, 0.79],
      [0.93, 0.68],
      [0.96, 0.57],
      [1, 0.49],
      [1.01, 0.001],
    ];
    for (let j = 0; j < strata.length; j++) {
      const [h, rad] = strata[j];
      for (let i = 0; i < n; i++) {
        const a = (tau * i) / n,
          rough =
            1 + 0.12 * Math.sin(a * 5 + 0.3) + 0.067 * Math.cos(a * 9) + 0.044 * Math.sin(a * 3 + j * 0.6);
        pos.push(
          Math.cos(a) * rad * rough,
          h + 0.023 * Math.sin(a * 3 + 0.25 * j),
          Math.sin(a) * rad * rough
        );
        const value = [0.68, 0.81, 0.9, 0.82, 1.0, 0.96, 0.86][j % 7] * (0.97 + 0.03 * Math.sin(i * 3));
        colors.push(value, value * 0.98, value * 0.95);
        if (j) {
          const k = j * n + i,
            l = j * n + ((i + 1) % n);
          idx.push(k - n, k, l - n, l - n, k, l);
        }
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  });
}
function island(m, x, y, z, w, h, d, color, angle = 0) {
  m.place(mesaGeo(), 'living', color, x, y, z, w, h, d, [0, angle, 0]);
}
function promenade(m, info) {
  const p = stone.ocean,
    rnd = random(info.seed);
  m.box(0, -1.55, 10, 12.5, 3.05, 46, p[2]);
  m.box(12, -1.57, 8, 16, 3, 9, p[2]);
  // Full-depth bridge piers extend into the tide.
  for (let z = -10; z < 34; z += 6)
    for (const s of [-1, 1]) {
      m.box(s * 5.3, -4.2, z, 1.6, 7, 2.2, p[2]);
      m.box(s * 5.3, -1.83, z, 2, 1.1, 2.8, p[0]);
    }
  for (let row = 0; row < 42; row++) {
    const z = -12.5 + row * 1.09;
    for (let col = 0; col < 7; col++) {
      const x = (col - 3) * 1.76;
      m.box(
        x,
        -0.061 + rnd() * 0.012,
        z,
        1.746,
        0.12,
        1.076,
        shade(col === 0 || col === 6 ? p[1] : '#8c9183', 0.8 + 0.28 * rnd())
      );
    }
    for (const x of [-2.88, 2.88]) m.box(x, 0.013, z, 0.042, 0.012, 1.07, p[3], null, 'metal');
  }
  for (let x = 6.8; x < 20; x += 1.45)
    for (let z = 4.1; z < 12.5; z += 1.04)
      m.box(x, -0.06, z, 1.43, 0.12, 1.025, shade(p[0], 0.95 + 0.2 * rnd()));
  for (const s of [-1, 1])
    for (let z = -11.3; z < 33; z += 3.5) {
      if (s === 1 && z > 2.5 && z < 14) continue;
      m.box(s * 6.03, 0.29, z, 0.54, 0.58, 3.48, p[0]);
      m.box(s * 6.03, 0.62, z, 0.61, 0.09, 3.49, p[1]);
      m.box(s * 6.03, 0.56, z - 1.44, 0.82, 1.12, 0.76, p[0]);
      m.box(s * 6.03, 1.15, z - 1.44, 0.9, 0.11, 0.89, p[1]);
      if (Math.round((z + 11.3) / 3.5) % 3 === 0) {
        m.cylinder(s * 6.03, 1.48, z - 1.44, 0.29, 0.54, 0.29, p[2], null, 'metal');
        m.cylinder(s * 6.03, 1.71, z - 1.44, 0.24, 0.18, 0.24, '#ffdf99', null, 'light');
        m.cone(s * 6.03, 1.9, z - 1.44, 0.33, 0.22, 0.33, p[3], null, 'metal');
      }
    }
  // Walls share the exact outline of the connected pair of decks.
  for (const v of [
    [-6.26, 10, 0.21, 46],
    [6.26, -4.7, 0.21, 16.6],
    [6.26, 22.75, 0.21, 20.5],
    [13.12, 3.5, 13.75, 0.22],
    [13.12, 12.5, 13.75, 0.22],
    [20, 8, 0.22, 9],
    [0, -13, 12.5, 0.22],
    [0, 33, 12.5, 0.22],
  ])
    info.barriers.push(barrier(...v));
  for (const z of [3.5, 12.5]) m.box(13, 0.35, z, 13.7, 0.7, 0.4, p[0]);
  // A survey dial is inlaid in the paving in front of the first crossing.
  for (const radius of [1.72, 1.63, 1.35]) m.ring(0, 0.024, 7.2, radius, 0.022, p[3], [PI / 2, 0, 0]);
  for (let i = 0; i < 40; i++) {
    const a = (i * tau) / 40,
      r = 1.48;
    m.box(
      Math.sin(a) * r,
      0.035,
      7.2 + Math.cos(a) * r,
      0.032,
      0.018,
      i % 5 ? 0.11 : 0.28,
      p[3],
      [0, a, 0],
      'metal'
    );
  }
}
export function ocean(m, info) {
  promenade(m, info);
  const rng = random(info.seed + 4),
    p = stone.ocean;
  // The lost viaduct bends away in depth, its arches framed against the sea.
  for (let i = 0; i < 22; i++) {
    const x = -122 + i * 8,
      z = -68 + Math.sin(i * 0.2) * 10;
    if (x > -10 && x < 23) continue;
    m.box(x, -0.55, z, 1.6, 10, 2, p[0]);
    arch(m, x + 4, 2.8, z, 3.24, 4.08, 1.9, 13, p[0]);
    m.box(x + 4, 7.0, z, 8, 0.61, 2.4, p[1]);
    m.box(x + 4, 7.44, z, 8, 0.21, 2.63, p[0]);
    if (i % 3 === 0) m.cone(x, 8.5, z, 0.56, 2.1, 0.55, p[0]);
  }
  for (let i = 0; i < 26; i++) {
    const a = (i * tau) / 26 + 0.06 * rng(),
      d = 100 + 80 * rng(),
      h = 5 + 12 * rng();
    island(m, Math.cos(a) * d, -6, Math.sin(a) * d, 10 + 20 * rng(), h, 10 + 14 * rng(), '#829286', a);
  }
  // Ruined astronomical sight on its own offshore foundation.
  island(m, 32, -6, -30, 7.5, 7, 6, '#707e73');
  const rx = 32,
    rz = -30;
  for (const s of [-1, 1]) {
    m.box(rx + s * 4.1, 5.4, rz, 1.83, 10.8, 2.4, p[0]);
    m.cone(rx + s * 4.1, 11.9, rz, 1.12, 2.5, 1.34, p[0]);
  }
  m.ring(rx, 12.5, rz, 7.4, 0.39, p[2], [0, -0.44, -0.12]);
  m.ring(rx, 12.5, rz, 6.8, 0.105, p[3], [0, -0.44, -0.12]);
  m.ring(rx, 12.5, rz, 6.54, 0.18, p[0], [0.48, 0.85, 0.24]);
  m.orb(rx, 12.5, rz, 0.91, 0.91, 0.91, p[3]);
  for (let i = 0; i < 13; i++) {
    const a = rng() * tau,
      r = 25 + 35 * rng(),
      x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    if (Math.abs(x) < 12) continue;
    m.box(x, -2 + rng() * 2, z, 1.2 + rng(), 8 + rng() * 4, 1.5, p[0], [0, rng(), 0.12 * rng()]);
  }
}

export function desert(m, info) {
  const rng = random(info.seed + 31),
    p = stone.desert;
  // Two chains of stratified mesas form a valley opening toward the moons.
  for (const s of [-1, 1])
    for (let i = 0; i < 22; i++) {
      const x = s * (32 + rng() * 59),
        z = -135 + i * 9 + rng() * 14;
      const w = 8 + rng() * 15,
        h = 9 + rng() * 25,
        d = 6 + rng() * 12;
      island(m, x, -4, z, w, h, d, shade('#bf7955', 0.8 + 0.26 * rng()), rng() * tau);
      info.barriers.push(barrier(x, z, w * 1.5, d * 1.45));
    }
  for (let i = 0; i < 18; i++) {
    const x = -110 + i * 14,
      z = -129 - 34 * rng();
    island(m, x, -4, z, 10 + rng() * 12, 10 + rng() * 19, 8 + rng() * 14, '#b78066', rng() * tau);
  }
  // A broken orrery, half-buried in the slip face. A fork of standing stones
  // repeats its arc downhill like the graduations on an instrument.
  const x = 13,
    z = -26,
    y = ground(info, x, z) + 3.4;
  m.ring(x, y, z, 9.2, 0.65, '#895937', [0.12, -0.52, 0.08], 'stone');
  m.ring(x, y, z, 8.53, 0.15, '#e2b06c', [0.12, -0.52, 0.08]);
  m.ring(x, y, z, 7.85, 0.36, '#a7724c', [-0.18, 0.44, 0.24]);
  m.orb(x, y, z, 1.18, 1.18, 1.18, '#c79858');
  for (let i = 0; i < 11; i++) {
    const px = 7 + i * 1.55,
      pz = -1 - i * 1.85,
      h = 1.15 + i * 0.43;
    m.cone(
      px,
      ground(info, px, pz) + h * 0.36,
      pz,
      0.46,
      h,
      0.42,
      shade(p[0], 0.8 + 0.15 * rng()),
      [0, 0.12, -0.24]
    );
  }
  for (let i = 0; i < 29; i++) {
    const u = i / 28,
      pz = 12 - u * 25,
      px = -3.6 * u + 1.3 * Math.sin(u * tau);
    const twist = Math.sin(u * 9) * 0.18;
    for (const side of [-1, 1]) {
      const dx = px + side * (0.47 + 0.1 * Math.sin(i * 3));
      m.box(
        dx,
        ground(info, dx, pz) - 0.063,
        pz,
        0.84,
        0.13,
        0.62 + (i % 3) * 0.07,
        shade('#d0a77e', 0.85 + 0.07 * (i % 4)),
        [0, twist, 0]
      );
    }
    if (i % 6 === 0) {
      const sx = px + 2.1,
        sy = ground(info, sx, pz);
      m.box(sx, sy + 0.4, pz, 0.47, 0.8, 0.42, p[0], [0, 0.16, -0.09]);
      m.box(sx, sy + 0.57, pz + 0.23, 0.23, 0.046, 0.027, p[3], null, 'metal');
      info.barriers.push(barrier(sx, pz, 0.48, 0.43));
    }
  }
  for (let i = 0; i < 85; i++) {
    const x = (rng() - 0.5) * 148,
      z = (rng() - 0.55) * 135;
    if (Math.abs(x) < 16 && Math.abs(z) < 24) continue;
    const k = 0.35 + rng() ** 3 * 2.5;
    island(m, x, ground(info, x, z) - 0.12, z, k, k * (0.4 + rng()), k * 0.7, '#af7450', rng() * tau);
  }
}

function mushroomCap() {
  return shape('fluted-cap', () => {
    const pos = [],
      cols = [],
      idx = [],
      N = 48;
    const rings = [
      [0.012, 0.94],
      [0.18, 0.91],
      [0.39, 0.82],
      [0.65, 0.63],
      [0.84, 0.39],
      [0.96, 0.17],
      [1, 0.035],
      [0.993, 0],
      [0.81, 0.12],
      [0.5, 0.23],
      [0.16, 0.3],
      [0.01, 0.29],
    ];
    rings.forEach(([r, h], j) => {
      for (let i = 0; i < N; i++) {
        const a = (tau * i) / N,
          f = 1 + 0.056 * Math.sin(5 * a) + 0.023 * Math.sin(9 * a + 0.6);
        const gill = i % 2 ? 0.72 : 1.22;
        pos.push(
          Math.cos(a) * r * f,
          h + (j > 6 ? 0.027 * (i % 2) : 0.025 * Math.sin(a * 5)) * r,
          Math.sin(a) * r * f
        );
        const bright =
          j === 6 || j === 7
            ? 1.28
            : j > 7
              ? gill * (0.73 + 0.22 * r)
              : 0.43 + 0.42 * r + 0.11 * Math.sin(a * 7) * r;
        cols.push(bright * (j < 6 ? 0.65 : 0.93), bright, bright * (j < 6 ? 0.94 : 0.88));
        if (j) {
          const k = j * N + i,
            l = j * N + ((i + 1) % N);
          idx.push(k - N, k, l - N, l - N, k, l);
        }
      }
    });
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  });
}
export function forest(m, info) {
  const rng = random(info.seed + 71);
  for (let i = 0; i < 125; i++) {
    const x = (rng() - 0.5) * 108,
      z = (rng() - 0.5) * 122;
    if (
      (Math.abs(x) < 5.4 && z < 18 && z > -25) ||
      info.gates.some((g) => Math.hypot(x - g.origin.x, z - g.origin.z) < 6)
    )
      continue;
    const y = ground(info, x, z),
      h = 3 + rng() ** 1.45 * 13,
      r = h * (0.22 + rng() * 0.16),
      lean = (rng() - 0.5) * 1.6;
    const stem = shape('channeled-stem', () => {
      const points = [],
        faces = [],
        colors = [],
        count = 16,
        layers = 10;
      for (let j = 0; j <= layers; j++)
        for (let k = 0; k < count; k++) {
          const a = (tau * k) / count,
            t = j / layers,
            r = (0.67 + 0.51 * (1 - t) ** 3 + 0.75 * t ** 8) * (1 + 0.16 * Math.cos(5 * a + t * 3));
          points.push(
            r * Math.cos(a) + 0.3 * Math.sin(t * tau),
            t,
            r * Math.sin(a) + 0.17 * Math.sin(t * 3)
          );
          const light = 0.42 + 0.38 * t + 0.13 * Math.cos(5 * a + t * 3);
          colors.push(light * 0.77, light, light * 0.86);
          if (j) {
            const v = j * count + k,
              l = j * count + ((k + 1) % count);
            faces.push(v - count, v, l - count, l - count, v, l);
          }
        }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(points, 3));
      geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
      geo.setIndex(faces);
      geo.computeVertexNormals();
      return geo;
    });
    const thickness = 0.22 + h * 0.036;
    m.place(stem, 'living', '#608879', x, y - 0.2, z, thickness, h + 0.1, thickness, [0, 0, -lean / h]);
    if (Math.abs(x) < 28 && Math.abs(z) < 35)
      info.barriers.push(barrier(x, z, 0.35 + h * 0.06, 0.35 + h * 0.06));
    for (let j = 0; j < 4; j++) {
      const a = (j * PI) / 2 + rng() * 0.4;
      m.beam(
        [x + Math.cos(a) * r * 0.6, y - 0.1, z + Math.sin(a) * r * 0.6],
        [x, y + 1.7, z],
        0.12 + h * 0.011,
        '#456454'
      );
    }
    const cx = x + lean,
      cz = z + 0.2,
      color = rng() < 0.28 ? '#c4a2c9' : rng() < 0.5 ? '#77c5a5' : '#96d6bd';
    const ang = rng() * tau;
    m.place(mushroomCap(), 'cap', color, cx, y + h - 0.3, cz, r, r * 0.64, r, [0, ang, 0]);
    // Narrow lamellae on the underside follow the cap's scalloped outline.
    // The mesh is shared by the entire grove, including distant colonies.
    const lamellae = shape('luminous-lamellae', () => {
      const vertices = [];
      for (let j = 0; j < 42; j++) {
        const a = (j * tau) / 42,
          co = Math.cos(a),
          si = Math.sin(a);
        const curve = (t) => {
          const f = 1 + 0.056 * Math.sin(5 * a) + 0.023 * Math.sin(9 * a + 0.6);
          return [co * t * f, 0.295 * (1 - t * t) + 0.014 * Math.sin(a * 5) * t - 0.018, si * t * f];
        };
        for (let k = 0; k < 4; k++) {
          const a0 = curve(0.2 + k * 0.19),
            b0 = curve(0.2 + (k + 1) * 0.19);
          const a1 = [a0[0] - si * 0.008, a0[1] - 0.005, a0[2] + co * 0.008],
            b1 = [b0[0] - si * 0.008, b0[1] - 0.005, b0[2] + co * 0.008];
          vertices.push(...a0, ...b0, ...a1, ...b0, ...b1, ...a1);
        }
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      return geo;
    });
    m.place(lamellae, 'light', i % 4 ? '#8cd5a9' : '#dcb5c8', cx, y + h - 0.3, cz, r, r * 0.64, r, [
      0,
      ang,
      0,
    ]);
    m.orb(cx, y + h - 0.18, cz, r * 0.2, 0.28, r * 0.2, '#acffe0', 'light');
    if (i % 3 === 0) {
      const br = r * 0.56;
      m.beam([x, y + h * 0.51, z], [x - br, y + h * 0.69, z + 0.5], 0.18, '#466455');
      m.place(mushroomCap(), 'cap', '#a7cdb1', x - br, y + h * 0.68, z + 0.5, br, br * 0.63, br, [
        0,
        rng() * tau,
        0.11,
      ]);
    }
    if (r > 2.5 && Math.abs(x) < 32 && Math.abs(z) < 38) {
      for (let j = 0; j < 8; j++) {
        const angle = (j * tau) / 8 + i * 0.11,
          tx = cx + Math.cos(angle) * r * 0.76,
          tz = cz + Math.sin(angle) * r * 0.76;
        const low = y + h - r * (0.16 + 0.44 * (0.5 + 0.5 * Math.sin(angle * 3.3)));
        m.beam([tx, y + h + 0.04, tz], [tx + 0.09, low, tz + 0.15], 0.016, '#91b7a3');
        m.orb(tx + 0.09, low, tz + 0.15, 0.047, 0.1, 0.047, j % 3 ? '#83dfcf' : '#f1cc93', 'light');
      }
    }
    for (let j = 0; j < 5; j++) {
      const a = rng() * tau,
        k = r * (0.73 + rng() * 0.2);
      m.orb(
        cx + Math.cos(a) * k,
        y + h + r * 0.17,
        cz + Math.sin(a) * k,
        0.062,
        0.038,
        0.062,
        '#d6ffdb',
        'light'
      );
    }
  }
  for (let i = 0; i < 100; i++) {
    const x = (rng() - 0.5) * 52,
      z = (rng() - 0.5) * 63,
      y = ground(info, x, z);
    if (Math.abs(x) < 3.5 && Math.abs(z) < 20) continue;
    const f = 0.17 + rng() * 0.37;
    m.cylinder(x, y + f * 0.65, z, 0.041, 1.35 * f, 0.041, '#649a87');
    m.orb(x, y + 1.4 * f, z, f * 0.58, f * 0.38, f * 0.58, i % 3 ? '#80d7b4' : '#d5c7f3', 'light');
  }
  for (let i = 0; i < 16; i++) {
    const a = (i * tau) / 16,
      r = 75 + rng() * 35;
    island(m, Math.sin(a) * r, -5, Math.cos(a) * r, 12, 9 + rng() * 17, 13, '#456858', a);
  }
}
