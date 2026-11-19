'use strict';
// All coordinates are metres. The builder batches chipped stone, strata and vegetation
// into one indexed-by-order triangle stream so software WebGL can orbit the site.
function createModel(site, found, year = null) {
  const pos = [],
    col = [],
    uv = [];
  let rand = randomSource(site.seed);
  const rr = (a, b) => a + (b - a) * rand(),
    pick = (a) => a[Math.floor(rand() * a.length)];
  const palette = ['#c1b49a', '#a99d85', '#bbae97', '#c7baa0', '#9e9279', '#b8ae98'];
  const stone = () => pick(palette),
    dirt = ['#957850', '#a68a61', '#b19468', '#ac9165'];
  const history = year !== null,
    alive = history && year < site.events.at(-1).year;
  function tri(a, b, c, color, gain = 1) {
    const shade = new THREE.Color(color).multiplyScalar(gain);
    const ab = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),
      ac = new THREE.Vector3(...c).sub(new THREE.Vector3(...a));
    const n = ab.cross(ac);
    const horizontal = Math.abs(n.y) > Math.max(Math.abs(n.x), Math.abs(n.z));
    for (const p of [a, b, c]) {
      pos.push(...p);
      col.push(shade.r, shade.g, shade.b);
      uv.push((horizontal ? p[0] : p[0] + p[2]) * 0.52, (horizontal ? p[2] : p[1]) * 0.52);
    }
  }
  function rings(bottom, top, color) {
    for (let i = 0; i < bottom.length; i++) {
      const j = (i + 1) % bottom.length,
        g = rr(0.96, 1.04);
      tri(bottom[i], top[i], top[j], color, g);
      tri(bottom[i], top[j], bottom[j], color, g);
    }
    for (let i = 1; i < top.length - 1; i++) tri(top[0], top[i + 1], top[i], color);
  }
  function block(x, y, z, w, h, d, c = stone(), angle = 0, rough = 0.04) {
    const cut = Math.min(w, d) * rr(0.055, 0.13),
      cs = Math.cos(angle),
      sn = Math.sin(angle);
    const pts = [
      [-w / 2 + cut, -d / 2],
      [w / 2 - cut, -d / 2],
      [w / 2, -d / 2 + cut],
      [w / 2, d / 2 - cut],
      [w / 2 - cut, d / 2],
      [-w / 2 + cut, d / 2],
      [-w / 2, d / 2 - cut],
      [-w / 2, -d / 2 + cut],
    ];
    const ring = (dy, s, j) =>
      pts.map(([u, v]) => [
        x + (u * cs - v * sn) * s + rr(-j, j),
        y + dy + rr(-j, j),
        z + (u * sn + v * cs) * s + rr(-j, j),
      ]);
    const r0 = ring(0, 0.97, 0),
      r1 = ring(h * 0.86, 1, Math.min(rough, h * 0.1)),
      r2 = ring(h, 0.94, Math.min(rough, h * 0.09));
    rings(r0, r1, c);
    rings(r1, r2, c);
  }
  function tube(x, z, y, h, r1, r2, c, facets = 12, offset = [0, 0]) {
    const ring = (radius, dy, ox, oz) =>
      Array.from({ length: facets }, (_, i) => [
        x + ox + Math.cos((i * 2 * Math.PI) / facets) * radius,
        y + dy,
        z + oz + Math.sin((i * 2 * Math.PI) / facets) * radius,
      ]);
    rings(ring(r1, 0, 0, 0), ring(r2, h, ...offset), c);
  }
  const locations = [
    [-2.75, 2.85],
    [4.99, -0.64],
    [3.4, 2.15],
  ];
  const dug = locations.map((_, zone) =>
    found.reduce(
      (v, id) => Math.max(v, ...site.finds.filter((f) => f.id === id && f.zone === zone).map((f) => f.depth)),
      0,
    ),
  );
  const trenchAt = (x, z) => locations.findIndex(([u, v]) => Math.abs(x - u) < 0.78 && Math.abs(z - v) < 0.6);
  const height = (x, z) =>
    (z > 3.4 ? -0.22 : 0) +
    0.08 * Math.sin(x * 1.7) +
    0.06 * Math.sin(z * 2.3 + x * 0.5) +
    0.09 * Math.cos(x * 0.6 - z);
  const halfX = 6.1,
    halfZ = 4.25,
    nx = 44,
    nz = 32;
  const grid = [];
  for (let j = 0; j <= nz; j++) {
    grid[j] = [];
    for (let i = 0; i <= nx; i++) {
      let x = ((i / nx) * 2 - 1) * halfX,
        z = ((j / nz) * 2 - 1) * halfZ;
      const edge = Math.pow(Math.abs(x / halfX), 7) * Math.pow(Math.abs(z / halfZ), 7);
      x *= 1 - 0.1 * edge;
      z *= 1 - 0.12 * edge;
      x += rr(-0.073, 0.073);
      z += rr(-0.068, 0.068);
      grid[j][i] = [x, height(x, z) + rr(-0.045, 0.045), z];
    }
  }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      let a = grid[j][i],
        b = grid[j + 1][i],
        c = grid[j + 1][i + 1],
        d = grid[j][i + 1];
      const zone = trenchAt((a[0] + c[0]) * 0.5, (a[2] + c[2]) * 0.5);
      if (!history && zone >= 0) continue;
      const soil = a[2] > 3.45 ? '#8b8768' : Math.sin(a[0] * 1.4 + a[2] * 2) > 0.72 ? '#9d936c' : '#ac987a',
        v = rr(0.94, 1.06);
      tri(a, b, c, soil, v);
      tri(a, c, d, soil, v);
    }
  const perimeter = [
    ...grid[0],
    ...grid.slice(1).map((row) => row[nx]),
    ...grid[nz].slice(0, nx).reverse(),
    ...grid
      .slice(1, nz)
      .reverse()
      .map((row) => row[0]),
  ];
  let upper = perimeter;
  const strata = [
    '#9c7449',
    '#aa8056',
    '#94704c',
    '#af9271',
    '#b69871',
    '#886747',
    '#785940',
    '#8f6b48',
    '#a37c53',
    '#836345',
    '#795c46',
    '#694e3b',
  ];
  for (let k = 0; k < 12; k++) {
    if (history && site.deposits[3 - Math.floor(k / 3)].start > year) continue;
    const layer = site.deposits[3 - Math.floor(k / 3)];
    const fraction = history ? Math.min(1, (year - layer.start + 1) / (layer.end - layer.start + 1)) : 1;
    const thickness = ((layer.bottom - layer.top) * 0.007 * fraction) / 3;
    const lower = upper.map(([x, y, z], i) => [
      x * 0.998 + rr(-0.03, 0.03),
      y - thickness * (1 + 0.1 * Math.sin(i * 0.16 + k * 0.8) + rr(-0.065, 0.065)),
      z * 0.998 + rr(-0.03, 0.03),
    ]);
    for (let i = 0; i < upper.length; i++) {
      const j = (i + 1) % upper.length,
        g = rr(0.87, 1.09);
      tri(upper[i], upper[j], lower[j], strata[k], g);
      tri(upper[i], lower[j], lower[i], strata[k], g);
      if (rand() > 0.48) {
        const a = lower[i],
          b = upper[i],
          m = [a[0] * 1.004, (a[1] + b[1]) / 2, a[2] * 1.004],
          v = rr(0.025, 0.085);
        tri(
          m,
          [m[0] + (lower[j][0] - a[0]) * 0.6, m[1] + v * 0.2, m[2] + (lower[j][2] - a[2]) * 0.6],
          [m[0], m[1] + v, m[2]],
          pick(dirt),
        );
      }
    }
    upper = lower;
  }
  function paving(x, z, w, d, base, n, m) {
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m; j++)
        block(
          x - w / 2 + ((i + 0.5) * w) / n,
          base,
          z - d / 2 + ((j + 0.5) * d) / m,
          w / n - 0.016,
          0.18 + rr(-0.02, 0.025),
          d / m - 0.016,
        );
  }
  let retention = 1;
  function wall(x, z, n, levels, angle, broken) {
    const along = [Math.cos(angle), Math.sin(angle)];
    for (let row = 0; row < levels; row++)
      for (let i = 0; i < n; i++) {
        let u = i + 0.5 + (row % 2) * 0.43;
        if (u > n) continue;
        if (broken && row >= Math.max(1, Math.floor(levels * (retention + 0.4 * Math.cos(i * 1.2 + angle)))))
          continue;
        block(
          x + u * 0.61 * along[0],
          0.1 + row * 0.285,
          z + u * 0.61 * along[1],
          0.605,
          0.29,
          0.4,
          stone(),
          angle,
        );
      }
  }
  function column(x, z, n, cap) {
    block(x, 0.48, z, 0.85, 0.18, 0.83);
    tube(x, z, 0.66, 0.15, 0.4, 0.365, stone(), 16);
    tube(x, z, 0.81, 0.13, 0.34, 0.31, stone(), 16);
    for (let i = 0; i < n; i++) {
      const y = 0.94 + i * 0.38,
        r = 0.303 - i * 0.004,
        color = stone();
      const profile = (dy) =>
        Array.from({ length: 48 }, (_, j) => {
          const a = (j * 2 * Math.PI) / 48,
            rad = r * (j % 3 === 1 ? 0.905 : 1);
          return [x + Math.cos(a) * rad, y + dy, z + Math.sin(a) * rad];
        });
      rings(profile(0.005), profile(0.372), color);
    }
    if (cap) {
      const y = 0.94 + n * 0.38;
      tube(x, z, y, 0.16, 0.29, 0.41, stone(), 16);
      block(x, y + 0.16, z, 0.84, 0.21, 0.82);
    }
  }
  const visible = site.buildings.filter((b) => !history || site.events[b.origin].year <= year);
  for (const b of visible) {
    rand = randomSource(site.seed + b.origin * 997);
    retention = b.survival;
    if (b.type === 'court') {
      // Inlaid water lines and a carved dentil course share the court's construction event.
      for (let i = 0; i < 34; i++)
        for (const z of [-1.53, -0.19]) {
          block(-3.78 + i * 0.105, 0.416, z, 0.093, 0.012, 0.082, i % 3 ? '#9c8470' : '#726b56');
        }
      for (let i = 0; i < 13; i++) block(-4.04 + i * 0.195, 4.205, -1.438, 0.11, 0.086, 0.084, '#b9a98b');
      paving(-2.05, -0.67, 4.42, 3.24, 0.01, 6, 4);
      paving(-2.05, -0.79, 4.16, 2.83, 0.22, 6, 4);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          block(
            -2.49 + i * 0.27,
            0.421,
            -0.95 + j * 0.25,
            0.145,
            0.014,
            0.145,
            (i + j) % 2 ? '#827d66' : '#a88060',
            0.785,
          );
        }
      for (let i = 0; i < 3; i++) block(-2.0, 0.02 + i * 0.13, 1.33 - i * 0.21, 2.65 - i * 0.05, 0.14, 0.4);
      for (let row = 0; row < 2; row++)
        for (let i = 0; i < 3; i++)
          column(
            -3.68 + i * 1.6,
            -1.82 + row * 2.03,
            history ? 7 : [7, 7, 3, 6, 2, 1][row * 3 + i],
            history || (row === 0 && i < 2),
          );
      block(-2.88, 3.96, -1.82, 2.46, 0.32, 0.69);
      block(-2.88, 4.28, -1.82, 2.55, 0.12, 0.75);
      if (history) {
        block(-2.05, 3.96, 0.21, 4.14, 0.3, 0.69);
        const ridge = 5.05,
          eave = 4.29,
          left = -4.39,
          right = 0.25,
          zr = -0.8;
        for (const direction of [-1, 1]) {
          const ze = zr + direction * 1.68;
          tri([left, eave, ze], [right, eave, ze], [right, ridge, zr], '#a66e4b');
          tri([left, eave, ze], [right, ridge, zr], [left, ridge, zr], '#a66e4b');
          for (let i = 0; i < 18; i++)
            for (let row = 0; row < 5; row++) {
              const x = left + (i * (right - left)) / 18,
                z = zr + (direction * row * 1.68) / 5,
                y = ridge - (row * 0.76) / 5;
              const z2 = z + (direction * 1.68) / 5,
                y2 = y - 0.76 / 5;
              const c = pick(['#a06c4c', '#ae7a57', '#b57d56', '#a77354']);
              tri([x, y + 0.021, z], [x + 0.235, y + 0.021, z], [x + 0.235, y2 + 0.033, z2], c);
              tri([x, y + 0.021, z], [x + 0.235, y2 + 0.033, z2], [x, y2 + 0.033, z2], c);
            }
        }
        for (const x of [left, right])
          tri([x, eave, zr - 1.68], [x, ridge, zr], [x, eave, zr + 1.68], '#bdae90');
      }
      wall(-4.15, -2.28, 7, 3, 0, !history);
      if (!history) {
        // Fallen drums from the missing eastern colonnade.
        for (let i = 0; i < 3; i++) {
          const u = -0.64 + i * 0.32;
          const ring = (dx) =>
            Array.from({ length: 16 }, (_, j) => {
              let a = (j * Math.PI) / 8;
              return [u + dx, 0.66 + Math.sin(a) * 0.245, -0.65 + Math.cos(a) * 0.245 + dx * 0.2];
            });
          rings(ring(0), ring(0.3), stone());
        }
        for (let i = 0; i < 3; i++) block(-1.1 + i * 0.38, 0.44, -0.75, 0.36, 0.46, 0.56, stone(), 0.18);
      }
    }
    if (b.type === 'granary') {
      paving(2.52, -1.48, 3.5, 2.55, 0.01, 5, 4);
      wall(0.73, -2.92, 6, history ? 7 : 6, 0, !history);
      wall(4.3, -2.9, 5, history ? 7 : 5, Math.PI / 2, !history);
      wall(0.75, -2.8, 5, history ? 7 : 4, Math.PI / 2, !history);
      wall(0.75, 0.05, 2, 4, 0, !history);
      wall(3.12, 0.05, 2, 4, 0, !history);
      wall(2.52, -2.75, 3, 3, Math.PI / 2, !history);
      if (history) {
        for (let j = 0; j < 8; j++) block(2.52, 2.08, -2.9 + j * 0.408, 3.92, 0.17, 0.16, '#756247');
        for (let j = 0; j < 16; j++)
          block(2.52, 2.23, -3.0 + j * 0.207, 3.83, 0.13, 0.205, pick(['#a69673', '#b3a180', '#9e906e']));
        if (year < site.events.find((e) => e.type === 'depart').year) {
          for (let j = 0; j < 6; j++) block(2.03 + j * 0.155, 0.11, 0.08, 0.152, 1.58, 0.085, '#887055');
          block(2.42, 1.38, 0.14, 0.91, 0.09, 0.08, '#6d5841');
        }
      }
    }
    if (b.type === 'quay') {
      if (history) paving(2.55, 2.23, 4.0, 1.7, -0.03, 7, 4);
      else paving(1.37, 2.23, 1.6, 1.7, -0.03, 3, 4);
      wall(0.62, 3.21, 7, 2, 0, true);
      wall(4.58, 1.15, 3, 2, Math.PI / 2, true);
      if (!history)
        for (let i = 0; i < 15; i++)
          block(
            rr(0.5, 2.1),
            0.11,
            rr(1.2, 3.07),
            rr(0.2, 0.5),
            rr(0.06, 0.25),
            rr(0.2, 0.35),
            stone(),
            rr(-0.4, 0.4),
          );
    }
    if (b.type === 'hearth') {
      wall(-0.1, -3.56, 5, history ? 4 : 3, 0, !history);
      wall(-0.1, -3.56, 2, 3, Math.PI / 2, !history);
    }
    if (b.type === 'intake') {
      for (let i = 0; i < 8; i++) {
        block(-5.0 + i * 0.31, 0.04, 1.93, 0.3, 0.12, 0.22);
        block(-5 + i * 0.31, 0.06, 2.44, 0.3, 0.15, 0.23);
      }
      block(-3.1, 0.04, 2.18, 0.26, 0.2, 0.3);
    }
  }
  // The georeferenced survey cuts deepen to the last recovered object's depth.
  if (!history)
    for (let zone = 0; zone < 3; zone++) {
      const [x, z] = locations[zone],
        d = Math.max(0.115, dug[zone] * 0.007);
      const floor = -d,
        edge = 0.14;
      block(x, floor - 0.09, z, 1.87, 0.1, 1.5, '#83745b');
      const pts = [
        [-0.89, -0.71],
        [0.89, -0.71],
        [0.89, 0.71],
        [-0.89, 0.71],
      ];
      for (let i = 0; i < 4; i++) {
        const a = pts[i],
          b = pts[(i + 1) % 4];
        for (let j = 0; j < 4; j++) {
          const context = site.deposits[3 - j],
            l = j === 0 ? edge : -context.top * 0.007,
            h = Math.max(floor, -context.bottom * 0.007);
          if (l <= h) continue;
          const p = [x + a[0], l, z + a[1]],
            q = [x + b[0], l, z + b[1]],
            r = [q[0], h, q[2]],
            t = [p[0], h, p[2]],
            c = strata[j * 3];
          tri(p, q, r, c);
          tri(p, r, t, c);
        }
        tube(x + a[0], z + a[1], 0.055, 0.42, 0.022, 0.021, '#786348', 6);
        tube(x + a[0], z + a[1], 0.445, 0.07, 0.024, 0.024, '#e2be79', 6);
        const lineColor = '#decda9';
        tri([x + a[0], 0.4, z + a[1]], [x + b[0], 0.4, z + b[1]], [x + b[0], 0.416, z + b[1]], lineColor);
      }
    }
  // A shallow remnant pool follows the landing. Its extent tracks the simulated flow.
  const water = history ? (site.events.filter((e) => e.year <= year).at(-1)?.water ?? 1) : 0.05;
  const waterWidth = 0.13 + water * 0.57;
  for (let i = 0; i < 44; i++) {
    const x = -4.75 + i * 0.218,
      xa = x + 0.218;
    const bank = (u) => 3.74 + 0.095 * Math.sin(u * 1.7);
    const cy = -0.136;
    const a = [x, cy, bank(x) - waterWidth * 0.44],
      b = [xa, cy, bank(xa) - waterWidth * 0.44],
      c = [xa, cy, bank(xa) + waterWidth * 0.56],
      d = [x, cy, bank(x) + waterWidth * 0.56];
    tri(a, c, b, '#738982');
    tri(a, d, c, '#768c83');
  }
  if (alive) {
    const e = site.events.filter((v) => v.year <= year).at(-1);
    for (let row = 0; row < 4; row++)
      for (let i = 0; i < Math.ceil(e.water * 15); i++) {
        const x = -3.84 + i * 0.23,
          z = 2.56 + row * 0.18,
          y = height(x, z);
        tube(x, z, y, 0.19, 0.055, 0.008, '#9a9856', 5);
      }
    if (e.trade > 0 && e.water > 0.6) {
      const x = 1.69,
        z = 3.71;
      for (let j = -4; j <= 4; j++) {
        const w = 0.29 * (1 - Math.abs(j) * 0.16);
        block(x + j * 0.19, -0.13, z, 0.19, 0.19, w * 2, '#705a3f');
      }
      for (let j = 0; j < 3; j++) block(x - 0.37 + j * 0.34, 0.065, z, 0.075, 0.03, 0.39, '#a68b64');
    }
    const count = Math.min(12, Math.ceil(e.people / 11));
    for (let i = 0; i < count; i++) {
      const x = rr(-3.8, 3.1),
        z = rr(0.65, 1.04),
        y = height(x, z) + 0.08;
      tube(x, z, y, 0.27, 0.081, 0.06, pick(['#8b5941', '#877f5d', '#c5b595']), 8);
      tube(x, z, y + 0.27, 0.095, 0.045, 0.05, '#ad8463', 8);
    }
  }
  rand = randomSource(site.seed + 355);
  function tree(x, z, h) {
    let y = height(x, z),
      c = '#594d38';
    tube(x, z, y, h * 0.58, 0.1, 0.057, c, 7, [0.07, 0]);
    for (let branch = 0; branch < 7; branch++) {
      const angle = rr(0, 6.28),
        span = h * rr(0.14, 0.32),
        dx = Math.cos(angle) * span,
        dz = Math.sin(angle) * span;
      tube(x + 0.05, z, y + h * 0.32, h * 0.35, 0.053, 0.027, c, 6, [dx, dz]);
      for (let n = 0; n < 35; n++) {
        let a = rr(0, 6.28),
          rad = rr(0, 0.32),
          cx = x + dx + Math.cos(a) * rad,
          cz = z + dz + Math.sin(a) * rad,
          cy = y + h * 0.67 + rr(-0.22, 0.35),
          s = rr(0.075, 0.19);
        const green = pick(['#666d43', '#7e8352', '#777c4b', '#939063', '#62673b']);
        tube(cx, cz, cy, s * 0.72, s * 0.55, s, green, 7);
        tube(cx, cz, cy + s * 0.72, s * 0.78, s, s * 0.21, green, 7);
      }
    }
  }
  tree(-4.92, -2.45, 2.35);
  tree(4.94, -2.5, 1.7);
  tree(-5.17, 0.42, 1.05);
  const open = (x, z) =>
    !visible.some(
      (b) =>
        (b.type === 'court' && x > -4.5 && x < 0.35 && z > -2.55 && z < 1.59) ||
        (b.type === 'granary' && x > 0.5 && x < 4.5 && z > -3.12 && z < 0.4) ||
        (b.type === 'quay' && x > 0.4 && x < 4.75 && z > 1.0 && z < 3.4),
    );
  for (let i = 0; i < 1450; i++) {
    const x = rr(-5.84, 5.84),
      z = rr(-4, 4),
      y = height(x, z);
    if (!open(x, z) || (!history && trenchAt(x, z) >= 0)) continue;
    if (i % 4 === 0) {
      let s = rr(0.055, 0.26);
      block(x, y - 0.02, z, s, rr(0.06, 0.17), s * 0.8, pick(dirt), rr(0, 6));
    } else if (Math.sin(x * 2.1 + z * 3) > 0.06) {
      let c = pick(['#7b7643', '#8e8655', '#a29564', '#737347']);
      for (let k = 0; k < 8; k++) {
        let a = rr(0, 6.28),
          h = rr(0.07, 0.28);
        tri(
          [x - 0.021, y, z],
          [x + 0.026, y, z + 0.018],
          [x + Math.cos(a) * h * 0.65, y + h, z + Math.sin(a) * h * 0.65],
          c,
        );
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}
