// decals.js: lettering painted in code onto one canvas atlas, and placed in
// the world each frame: ship names on the bows, crane and carrier numbers,
// block letters and berth numbers on the ground.
'use strict';
(function (TL) {
  const L = TL.Layout, { F } = TL.GL, Sim = TL.Sim;
  const D = TL.Decals = {};

  // Build the atlas once for every label the scene can show.
  D.build = function (sim) {
    const cv = document.createElement('canvas');
    cv.width = 2048; cv.height = 1024;
    const g = cv.getContext('2d');
    const rects = new Map();
    let x = 4, y = 4, rowH = 0;
    const put = (key, text, font, color, opts = {}) => {
      g.font = font;
      const w = Math.ceil(g.measureText(text).width) + 16, h = opts.h || 64;
      if (x + w > cv.width) { x = 4; y += rowH + 6; rowH = 0; }
      if (opts.bg) { g.fillStyle = opts.bg; g.beginPath(); g.roundRect(x, y, w, h, opts.r || 8); g.fill(); }
      g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillText(text, x + w / 2, y + h / 2 + 2);
      rects.set(key, { u0: x / cv.width, v0: y / cv.height, u1: (x + w) / cv.width, v1: (y + h) / cv.height, aspect: w / h });
      x += w + 6; rowH = Math.max(rowH, h);
    };
    const sans = (wt, px) => `${wt} ${px}px Inter, "Helvetica Neue", Arial, sans-serif`;
    for (const c of sim.calls) put('ship:' + c.id, c.vessel.name.toUpperCase(), sans(700, 44), '#f7f2ea', { h: 60 });
    for (const c of sim.calls) put('home:' + c.id, 'ARDEN BAY', sans(600, 30), '#f7f2ea', { h: 44 });
    for (const c of sim.cranes) put('crane:' + c.k, c.id.replace('QC-', 'QC '), sans(800, 46), '#2c3a5c', { h: 60 });
    for (const sc of sim.scs) put('sc:' + sc.k, String(sc.k + 1).padStart(2, '0'), sans(800, 50), '#28304a', { h: 60 });
    for (const B of L.BLOCKS) put('blk:' + B.name, B.name, sans(800, 56), 'rgba(255,255,255,0.92)', { h: 64 });
    for (const B of L.BERTHS) put('berth:' + B.id, B.id, sans(800, 56), '#e2a93f', { h: 64 });
    for (const T of L.BAYS) put('bay:' + T.id, T.id, sans(700, 40), 'rgba(255,255,255,0.9)', { h: 50 });
    put('gate', 'GATE', sans(800, 48), '#f7f2ea', { h: 60 });
    put('slow', 'SLOW · 25', sans(700, 40), 'rgba(255,255,255,0.85)', { h: 50 });
    D.atlas = { canvas: cv, rects, verts: new Float32Array(6 * 6 * 400), count: 0 };
    return D.atlas;
  };

  // Screen-aligned flat text on the ground (reads upright from the camera).
  function flat(A, key, cx, cy, z, h, alpha = 1, cam) {
    const r = A.rects.get(key); if (!r) return;
    const w = h * r.aspect;
    const az = cam.az, ux = [-Math.sin(az), Math.cos(az)], vx = [-Math.cos(az), -Math.sin(az)];
    // Screen right is perpendicular to the view direction; screen up points away.
    const R = [ux[0] * w / 2, ux[1] * w / 2], U = [vx[0] * h / 2, vx[1] * h / 2];
    quad(A, [cx - R[0] - U[0], cy - R[1] - U[1], z], [cx + R[0] - U[0], cy + R[1] - U[1], z], [cx + R[0] + U[0], cy + R[1] + U[1], z], [cx - R[0] + U[0], cy - R[1] + U[1], z], r, alpha);
  }
  // Text on a plane given by a frame: local x to the right, local z up.
  function onFrame(A, key, fr, x, y, z, h, alpha = 1) {
    const r = A.rects.get(key); if (!r) return;
    const w = h * r.aspect;
    const P = (dx, dz) => F.apply(fr, x + dx, y, z + dz);
    quad(A, P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2), r, alpha);
  }
  function quad(A, a, b, c, d, r, alpha) {
    if (A.count + 6 > A.verts.length / 6) return;
    const V = A.verts;
    const put = (p, u, v) => { const o = A.count * 6; V[o] = p[0]; V[o + 1] = p[1]; V[o + 2] = p[2]; V[o + 3] = u; V[o + 4] = v; V[o + 5] = alpha; A.count++; };
    put(a, r.u0, r.v1); put(b, r.u1, r.v1); put(c, r.u1, r.v0);
    put(a, r.u0, r.v1); put(c, r.u1, r.v0); put(d, r.u0, r.v0);
  }

  D.fill = function (sim, t, cam) {
    const A = D.atlas; if (!A) return null;
    A.count = 0;
    // Ground: block letters at the quay end of each block, berth numbers.
    for (const B of L.BLOCKS) flat(A, 'blk:' + B.name, B.x0 + 14, B.y0 - 3.2, 0.05, 4.2, 0.95, cam);
    for (const B of L.BERTHS) flat(A, 'berth:' + B.id, B.x0 + 16, 46, 0.05, 6, 1, cam);
    for (const T of L.BAYS) flat(A, 'bay:' + T.id, T.x, 392.5, 0.05, 1.6, 0.9, cam);
    flat(A, 'slow', L.GATE.x - 40, 400, 0.05, 2.0, 0.8, cam);
    // Ship names on the bow and the port of registry on the stern, both sides.
    for (const call of sim.calls) {
      if (!call._matrix || call.state === 'planned' || call.state === 'gone') continue;
      const v = call.vessel, h = v.hull, fr = call._matrix.frame;
      const zN = h.D - 2.2, xN = h.L - 26;
      for (const side of [1, -1]) {
        const y = side * (h.halfBreadth(xN, zN) + 0.08);
        // On the starboard side the bow is on the reader's right; on port, left.
        const base = F.mul(fr, F.T(xN, y, 0));
        const fx = side > 0 ? base : F.mul(base, F.Rz(Math.PI));
        onFrame(A, 'ship:' + call.id, fx, 0, 0, zN, 2.4, 1);
        const xs = h.xAft + 14, ys = side * (h.halfBreadth(xs, h.D - 2) + 0.08);
        const bs = F.mul(fr, F.T(xs, ys, 0));
        onFrame(A, 'home:' + call.id, side > 0 ? bs : F.mul(bs, F.Rz(Math.PI)), 0, 0, h.D - 2.6, 1.4, 0.9);
      }
    }
    // Crane numbers on the water side of each machinery house.
    for (const c of sim.cranes) {
      const x = c._draw ? c._draw.x : c.x;
      const fr = F.mul(F.T(x, L.RAIL.land + 9 - 6.55, 0), F.Rz(0));
      onFrame(A, 'crane:' + c.k, fr, 0, -0.03, 44 + 6.6, 3.0, 1);
    }
    // Carrier numbers on the roof of each straddle carrier.
    for (const sc of sim.scs) if (sc._draw) flat(A, 'sc:' + sc.k, sc._draw.x, sc._draw.y, 16.05, 1.9, 1, cam);
    return A;
  };
})(globalThis.TL = globalThis.TL || {});
