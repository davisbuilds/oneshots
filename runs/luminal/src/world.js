// world.js: the backdrop, a perspective world behind the play plane.
// Everything here lives at a depth Z (the play plane is Z0) and is projected
// toward the horizon, so it moves with true parallax. Each section of the
// level has its own architecture, which rises in as the section begins.
'use strict';
(function (L) {
  const Z0 = 10;
  L.HORIZON = 0.62;            // horizon height as a fraction of the screen, from the top

  function generate(lv) {
    const props = [];
    lv.sections.forEach((sec, i) => {
      const nxt = lv.sections[i + 1];
      const x0 = sec.x, x1 = nxt ? nxt.x : lv.endX + 60;
      const R = L.rng(1000 + i * 17);
      const kind = { dawn: 'spire', pulse: 'arch', ascent: 'crystal', inversion: 'mirror', supernova: 'shard', echo: 'lantern', ascension: 'column', afterglow: 'column' }[sec.theme];
      const count = { spire: 90, mirror: 80, arch: 26, crystal: 70, monolith: 60, shard: 40, lantern: 50, column: 50 }[kind];
      for (let j = 0; j < count; j++) {
        let Z = kind === 'arch' ? 14 + j * 7 + R() * 3 : 13 + Math.pow(R(), 1.3) * 130;
        const k = Z0 / Z;
        const halfSpan = 22 / k;
        const X = x0 - halfSpan + R() * (x1 - x0 + 2 * halfSpan);
        const p = { kind, theme: sec.theme, X, Z, seed: R() };
        if (kind === 'mirror') { p.h = 2 + R() * R() * 9; p.w = 0.5 + R() * 1.2; p.lean = 0; p.top = j % 2 === 1; }
        if (kind === 'spire') { p.h = 3 + R() * R() * 16; p.w = 0.6 + R() * 1.6; p.lean = (R() - 0.5) * 0.15; }
        if (kind === 'arch') { p.X = x0 + (j / count) * (x1 - x0 + 2 * halfSpan) - halfSpan * 0.5; p.w = 5 + R() * 4; p.h = 7 + R() * 5; }
        if (kind === 'crystal') { p.Y = 2 + R() * 16; p.s = 0.5 + R() * 2.2; }
        if (kind === 'monolith') { p.h = 2 + R() * 10; p.w = 0.8 + R() * 2.5; p.top = R() < 0.5; }
        if (kind === 'shard') { p.Y = R() * 18 - 3; p.s = 0.6 + R() * 2.5; p.rot = R() * 6.28; }
        if (kind === 'lantern') { p.Y = 1 + R() * 14; p.s = 0.15 + R() * 0.35; }
        if (kind === 'column') { p.w = 0.3 + R() * 1.4; }
        props.push(p);
      }
    });
    props.sort((a, b) => b.Z - a.Z);
    return props;
  }

  L.World = function (r, lv) {
    const { mix, A } = L.color;
    const props = generate(lv);
    const W = {};

    W.draw = function (f) {
      const { cam, view, t, sig, th, weights, ceilW } = f;
      const eye = cam.y - (L.HORIZON - 0.5) * 2 * view.halfH;
      const P = (X, Y, Z) => { const k = Z0 / Z; return [cam.x + (X - cam.x) * k, eye + (Y - eye) * k]; };
      const left = view.left - 2, right = view.right + 2;
      const fog = th.sky[2];

      // ── distant ground plane: lines converging on the horizon ──
      r.blend('add');
      const step = 3;
      const span = view.halfW * 10;
      const g0 = Math.floor((cam.x - span) / step) * step;
      const lineCol = A(mix(th.acc, fog, 0.4), 0.13 * (1 - ceilW * 0.5));
      for (let X = g0; X < cam.x + span; X += step) {
        const a = P(X, 0, Z0), b = P(X, 0, Z0 * 14);
        if (Math.max(a[0], b[0]) < left || Math.min(a[0], b[0]) > right) continue;
        r.line(a[0], a[1], b[0], b[1], 0.03, lineCol, A(lineCol, 0));
      }
      for (let i = 1; i < 10; i++) {
        const Z = Z0 * Math.pow(1.45, i);
        const y = eye + (0 - eye) * Z0 / Z;
        r.line(left, y, right, y, 0.025 + 0.02 / i, A(mix(th.acc, fog, 0.5), 0.14 / Math.sqrt(i) * (1 - ceilW * 0.5)));
      }
      // ceiling plane in corridors
      if (ceilW > 0.01 && isFinite(f.ceil)) {
        for (let X = g0; X < cam.x + span; X += step) {
          const a = P(X, f.ceil, Z0), b = P(X, f.ceil, Z0 * 14);
          if (Math.max(a[0], b[0]) < left || Math.min(a[0], b[0]) > right) continue;
          r.line(a[0], a[1], b[0], b[1], 0.03, A(th.acc, 0.13 * ceilW), A(th.acc, 0));
        }
        for (let i = 1; i < 8; i++) {
          const Z = Z0 * Math.pow(1.45, i);
          const y = eye + (f.ceil - eye) * Z0 / Z;
          r.line(left, y, right, y, 0.025, A(th.acc, 0.12 / Math.sqrt(i) * ceilW));
        }
      }
      // horizon glow line
      r.line(left, eye, right, eye, 0.05, A(mix(th.sun, fog, 0.3), 0.35));
      r.glow(cam.x + view.halfW * 0.24, eye, view.halfW * 1.2, A(th.sun, 0.08 + 0.04 * sig.kick * sig.energy), 1.4);
      r.blend('alpha');

      // ── supernova tunnel: rings rushing at the camera ──
      const novaW = weights.supernova || 0;
      if (novaW > 0.01) {
        r.blend('add');
        const cx = cam.x + view.halfW * 0.24, cy = eye + 2.5;
        for (let i = 0; i < 16; i++) {
          const z = ((i * 11 - t * 38) % 176 + 176) % 176 + 3;
          const k = Z0 / z;
          const R = 15 * k;
          const fade = Math.min(1, (176 - z) / 40) * Math.min(1, z / 12);
          const a = 0.22 * novaW * fade * (0.6 + 0.6 * sig.kick);
          const n = 8, rot = i * 0.4 + t * 0.15;
          const pts = [];
          for (let j = 0; j < n; j++) { const ang = rot + j / n * Math.PI * 2; pts.push([cx + Math.cos(ang) * R, cy + Math.sin(ang) * R]); }
          r.polyline(pts, Math.max(0.03, 0.18 * k), A(i % 2 ? th.acc2 : th.sun, a), true);
        }
        r.blend('alpha');
      }

      // ── architecture ──
      for (const p of props) {
        const w = weights[p.theme] || 0;
        if (w < 0.01) continue;
        const k = Z0 / p.Z;
        const sx = cam.x + (p.X - cam.x) * k;
        const reach = (p.w || p.s || 4) * k * 3 + 12 * k;
        if (sx < left - reach || sx > right + reach) continue;
        const depthFade = Math.min(1, (150 - p.Z) / 60);
        const rise = L.smooth(w);
        const fogK = Math.min(0.85, p.Z / 160);
        const edge = A(mix(th.edge, fog, fogK), (0.25 + 0.5 * k) * depthFade * w);
        const fill = A(mix(th.fill, fog, fogK * 0.8), 0.92 * w);
        const pulse = sig.kick * sig.energy;
        if (p.kind === 'mirror') {
          // spires growing from the floor and, reflected, from the ceiling
          const h = p.h * rise, hw = p.w / 2, base = p.top ? 9 : 0, d = p.top ? -1 : 1;
          const b0 = P(p.X - hw, base, p.Z), b1 = P(p.X + hw, base, p.Z);
          const tip = P(p.X, base + d * (h + p.w), p.Z);
          r.tri(b0[0], b0[1], b1[0], b1[1], tip[0], tip[1], fill, fill, A(mix(th.fill, th.acc, 0.35), 0.92 * w));
          r.blend('add');
          r.polyline([b0, tip, b1], 0.03 + 0.05 * k, edge);
          r.blend('alpha');
        } else if (p.kind === 'spire') {
          const h = p.h * rise, hw = p.w / 2;
          const b0 = P(p.X - hw, 0, p.Z), b1 = P(p.X + hw, 0, p.Z);
          const t0 = P(p.X - hw * 0.7 + p.lean * h, h, p.Z), t1 = P(p.X + hw * 0.7 + p.lean * h, h, p.Z);
          const tip = P(p.X + p.lean * h * 1.1, h + p.w * 1.6, p.Z);
          r.quad(b0[0], b0[1], b1[0], b1[1], t1[0], t1[1], t0[0], t0[1], fill, A(mix(th.fill, th.acc, 0.25), 0.92 * w));
          r.tri(t0[0], t0[1], t1[0], t1[1], tip[0], tip[1], A(mix(th.fill, th.acc, 0.3), 0.92 * w));
          r.blend('add');
          const ew = 0.04 + 0.05 * k;
          r.polyline([b0, t0, tip, t1, b1], ew, edge);
          const mid = P(p.X + p.lean * h * 0.5, 0, p.Z), midT = P(p.X + p.lean * h * 1.05, h + p.w * 1.2, p.Z);
          r.line(mid[0], mid[1], midT[0], midT[1], ew * 0.6, A(edge, edge[3] * 0.5));
          r.glow(tip[0], tip[1], 1.5 * k + 0.3, A(th.acc, 0.25 * w * depthFade * (0.6 + 0.4 * pulse)));
          r.blend('alpha');
        } else if (p.kind === 'arch') {
          const hw = p.w / 2, h = p.h * rise;
          const q = [P(p.X - hw, 0, p.Z), P(p.X - hw, h, p.Z), P(p.X + hw, h, p.Z), P(p.X + hw, 0, p.Z)];
          // a wave of light runs down the corridor of arches on every beat
          const phase = Math.max(0, 1 - Math.abs(((sig.beat % 1) * 8) - (p.Z - 14) / 22));
          r.blend('add');
          const col = A(mix(th.edge, th.acc2, p.seed), (0.18 + 0.6 * k + 0.5 * phase * sig.energy) * depthFade * w);
          r.polyline(q, 0.08 + 0.25 * k, col);
          const qi = [P(p.X - hw + 0.6, 0, p.Z), P(p.X - hw + 0.6, h - 0.6, p.Z), P(p.X + hw - 0.6, h - 0.6, p.Z), P(p.X + hw - 0.6, 0, p.Z)];
          r.polyline(qi, 0.03 + 0.08 * k, A(col, col[3] * 0.45));
          r.blend('alpha');
        } else if (p.kind === 'crystal') {
          const bob = Math.sin(t * 0.8 + p.seed * 9) * 0.6;
          const c = P(p.X, (p.Y + bob) * (0.4 + 0.6 * rise), p.Z);
          const s = p.s * k, sp = s * 1.7;
          const ang = t * (0.2 + p.seed * 0.3) + p.seed * 6;
          const pts = [[c[0], c[1] + sp], [c[0] + s * Math.cos(ang), c[1]], [c[0], c[1] - sp], [c[0] - s * Math.cos(ang), c[1]]];
          r.poly(pts, A(mix(th.fill, th.acc, 0.2), 0.85 * w));
          r.blend('add');
          r.polyline(pts, 0.03 + 0.06 * k, edge, true);
          r.line(pts[0][0], pts[0][1], pts[2][0], pts[2][1], 0.02 + 0.03 * k, A(edge, edge[3] * 0.4));
          r.glow(c[0], c[1], sp * 2.5, A(th.acc, 0.1 * w * depthFade));
          r.blend('alpha');
        } else if (p.kind === 'monolith') {
          const hw = p.w / 2, h = p.h * rise;
          const yb = p.top ? 15 : 0, yt = p.top ? 15 - h : h;
          const q = [P(p.X - hw, yb, p.Z), P(p.X + hw, yb, p.Z), P(p.X + hw, yt, p.Z), P(p.X - hw, yt, p.Z)];
          r.quad(...q[0], ...q[1], ...q[2], ...q[3], fill);
          r.blend('add');
          r.polyline(q, 0.03 + 0.06 * k, edge, true);
          r.blend('alpha');
        } else if (p.kind === 'shard') {
          const c = P(p.X, eye + (p.Y - eye) * (0.3 + 0.7 * rise), p.Z);
          const s = p.s * k * (1 + pulse * 0.25);
          const a = p.rot + t * (0.5 + p.seed);
          const pts = [0, 1, 2].map(j => [c[0] + Math.cos(a + j * 2.1) * s * (j ? 0.6 : 1.4), c[1] + Math.sin(a + j * 2.1) * s * (j ? 0.6 : 1.4)]);
          r.blend('add');
          r.poly(pts, A(p.seed > 0.5 ? th.sun : th.acc2, (0.12 + 0.3 * k) * w * depthFade));
          r.polyline(pts, 0.03 + 0.05 * k, A(th.edge, (0.2 + 0.5 * k) * w * depthFade), true);
          r.blend('alpha');
        } else if (p.kind === 'lantern') {
          const c = P(p.X, p.Y + Math.sin(t * 0.5 + p.seed * 7) * 0.4, p.Z);
          r.blend('add');
          r.glow(c[0], c[1], p.s * 6 * k + 0.2, A(th.acc, 0.3 * w * depthFade));
          r.disk(c[0], c[1], p.s * k + 0.02, A(th.sun, 0.8 * w * depthFade));
          r.blend('alpha');
        } else if (p.kind === 'column') {
          const hw = p.w / 2;
          const b0 = P(p.X - hw, 0, p.Z), b1 = P(p.X + hw, 0, p.Z);
          const top = eye + (40 - eye) * k;
          r.blend('add');
          const a = (0.04 + 0.12 * k) * w * depthFade * (0.7 + 0.5 * pulse);
          r.quad(b0[0], b0[1], b1[0], b1[1], b1[0], top, b0[0], top, A(th.sun, a), A(th.acc, 0));
          r.glow((b0[0] + b1[0]) / 2, b0[1], p.w * k * 3 + 0.3, A(th.sun, a * 0.8), 0.3 + 0.4 * k);
          // motes rising inside the beam
          for (let m = 0; m < 3; m++) {
            const ph = ((t * (0.15 + p.seed * 0.1) + m / 3 + p.seed) % 1);
            const yy = b0[1] + (top - b0[1]) * ph;
            r.disk((b0[0] + b1[0]) / 2, yy, 0.05 + 0.08 * k, A(th.sun, (1 - ph) * a * 3));
          }
          r.blend('alpha');
        }
      }
      return eye;
    };
    return W;
  };
})(globalThis.LUMINAL = globalThis.LUMINAL || {});
