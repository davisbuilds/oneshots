// scene.js: everything the player sees, drawn each frame from the simulation
// state and the song's clock. Nothing here affects the physics.
'use strict';
(function (L) {
  const hex = (h, a = 1) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, a];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, (a[3] === undefined ? 1 : a[3]) + ((b[3] === undefined ? 1 : b[3]) - (a[3] === undefined ? 1 : a[3])) * t];
  const A = (c, a) => [c[0], c[1], c[2], a];
  const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k, c[3] === undefined ? 1 : c[3]];
  L.color = { hex, mix, A, mul };

  // ── Themes: one per section of the song ──────────────────────────────────
  // Hazards keep one colour everywhere (white core, red-pink edge), and no
  // theme uses that red, so danger always reads the same.
  const T = {
    dawn: { sky: ['#070a24', '#1b1a4f', '#7a4a7e'], sun: '#ffb38a', acc: '#53f2dc', acc2: '#8d7bff', fill: '#0d1338', edge: '#6ff6e6', ground: '#0a0e2c', star: 0.5, celestial: 'sun' },
    pulse: { sky: ['#07031a', '#1d0846', '#4b1a86'], sun: '#a88bff', acc: '#2fe3ff', acc2: '#b77bff', fill: '#120a35', edge: '#61e8ff', ground: '#0b0626', star: 0.7, celestial: 'rings' },
    ascent: { sky: ['#010913', '#04213a', '#0b4a5c'], sun: '#7dffd2', acc: '#4dff9a', acc2: '#3ac8ff', fill: '#04192a', edge: '#5dffb4', ground: '#03121f', star: 1, celestial: 'aurora' },
    inversion: { sky: ['#03040e', '#0f1430', '#2a2f66'], sun: '#cfe6ff', acc: '#9fe8ff', acc2: '#a98bff', fill: '#0a0e26', edge: '#d8f4ff', ground: '#080a14', star: 0.6, celestial: 'mirror' },
    supernova: { sky: ['#030108', '#120526', '#2a0b4a'], sun: '#ffd25a', acc: '#ffc840', acc2: '#3d7cff', fill: '#0e0620', edge: '#ffd86a', ground: '#07030f', star: 1, celestial: 'nova' },
    echo: { sky: ['#01030a', '#050d24', '#0d1f45'], sun: '#9fc4ff', acc: '#6aa8ff', acc2: '#a5b8ff', fill: '#060c22', edge: '#8ab8ff', ground: '#030716', star: 1.4, celestial: 'moon' },
    ascension: { sky: ['#0b0420', '#2b0f45', '#8a3f3c'], sun: '#ffe08a', acc: '#ffd45a', acc2: '#52e8ff', fill: '#1a0a2c', edge: '#ffe28c', ground: '#12061e', star: 0.4, celestial: 'rise' },
    afterglow: { sky: ['#120624', '#3a1650', '#a5585a'], sun: '#ffd9a0', acc: '#ffe6a8', acc2: '#ff9de2', fill: '#1d0b2e', edge: '#fff0c8', ground: '#160822', star: 0.5, celestial: 'rise' },
  };
  for (const k in T) {
    const t = T[k];
    for (const f of ['sun', 'acc', 'acc2', 'fill', 'edge', 'ground']) t[f] = hex(t[f]);
    t.sky = t.sky.map(c => hex(c));
    t.name = k;
  }
  L.THEMES = T;
  const HAZ = { core: hex('#fff4f6'), edge: hex('#ff2d55'), fill: hex('#2a0412'), glow: hex('#ff2d55', 0.55) };
  const MODE_COLOR = { cube: hex('#4ff3ff'), ship: hex('#4dff9a'), wave: hex('#d27bff') };
  const PORTAL_COLOR = { ship: MODE_COLOR.ship, wave: MODE_COLOR.wave, cube: MODE_COLOR.cube, flip: hex('#ffd84a'), normal: hex('#3aa2ff'), speed: hex('#ffffff') };
  const ORB_COLOR = { orb: hex('#ffd84a'), gravorb: hex('#3ac2ff'), pinkorb: hex('#ff8ae2') };
  const PAD_COLOR = { pad: hex('#ffd84a'), gravpad: hex('#3ac2ff'), pinkpad: hex('#ff8ae2') };
  L.MODE_COLOR = MODE_COLOR;

  // Theme weights at time t: crossfade over the beat before a section starts.
  function themeAt(lv, t) {
    const secs = lv.sections;
    let i = 0;
    while (i + 1 < secs.length && secs[i + 1].t <= t + L.BEAT) i++;
    const cur = secs[i];
    const prev = secs[i - 1];
    const k = prev ? L.smooth((t - (cur.t - L.BEAT)) / (L.BEAT * 1.0)) : 1;
    return { a: prev ? T[prev.theme] : T[cur.theme], b: T[cur.theme], k, sec: cur, prevSec: prev, idx: i };
  }

  function blendTheme(w) {
    const o = {};
    for (const f of ['sun', 'acc', 'acc2', 'fill', 'edge', 'ground']) o[f] = mix(w.a[f], w.b[f], w.k);
    o.sky = w.a.sky.map((c, i) => mix(c, w.b.sky[i], w.k));
    o.star = L.lerp(w.a.star, w.b.star, w.k);
    return o;
  }

  // ── Deterministic background props ──────────────────────────────────────
  function makeProps(lv) {
    const R = L.rng(7);
    const stars = [];
    for (let i = 0; i < 260; i++) stars.push({ x: R() * 400, y: R() * 1, s: 0.3 + R() * R() * 1.6, tw: R() * 6.28 });
    return { stars };
  }

  L.Scene = function (renderer, lv) {
    const r = renderer;
    const props = makeProps(lv);
    // Objects sorted for culling.
    const byX = (arr, f) => arr.map((o, i) => ({ o, x: f(o), i })).sort((a, b) => a.x - b.x);
    const spikes = byX(lv.spikes, o => o.cx - 0.6);
    const solids = byX(lv.solids, o => o.x0);
    const walls = byX(lv.walls, o => Math.min(...o.pts.map(p => p[0])));
    const trigs = byX(lv.triggers, o => o.x0);
    const saws = byX(lv.hazards.filter(h => h.type === 'saw'), o => o.x0);
    const portals = byX(lv.portals.filter(p => !p.hidden), o => o.x - 1);
    const maxW = { solids: Math.max(1, ...lv.solids.map(o => o.x1 - o.x0)), walls: 40 };

    function visible(list, x0, x1, maxWidth, fn) {
      let lo = 0, hi = list.length;
      const from = x0 - maxWidth - 2;
      while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].x < from) lo = m + 1; else hi = m; }
      for (let i = lo; i < list.length && list[i].x <= x1 + 2; i++) fn(list[i].o, list[i].i);
    }

    const sc = { theme: null };

    // ── Background ────────────────────────────────────────────────────────
    function drawSky(th, W, H, horizonY, sig, wts) {
      r.screen();
      const [c0, c1, c2] = th.sky;
      const lift = sig.kick * 0.04 * sig.energy;
      r.rectV(0, horizonY, W, 0, mul(c2, 1 + lift), c0);
      r.rectV(0, H, W, horizonY, mul(c2, 0.5), mul(c2, 0.9));
      r.rectV(0, horizonY, W, horizonY * 0.45, A(c2, 0), A(c1, 0.0));
      r.blend('add');
      // horizon haze
      r.glow(W / 2, horizonY, W * 0.75, A(c2, 0.35 + lift * 2), H * 0.22);
      r.blend('alpha');
    }

    function drawStars(th, cam, W, H, t) {
      r.blend('add');
      const par = 0.04;
      const span = 400;
      for (const s of props.stars) {
        let x = ((s.x - cam.x * par) % span + span) % span / span * W * 1.1 - W * 0.05;
        const y = s.y * H * 0.62;
        const tw = 0.55 + 0.45 * Math.sin(t * 1.7 + s.tw);
        r.disk(x, y, s.s * (r.scale), [1, 1, 1, 0.5 * th.star * tw]);
      }
      r.blend('alpha');
    }

    function drawCelestial(w, th, W, H, horizonY, t, sig) {
      // Each theme brings its own sky object; during a crossfade both show.
      const draw = (kind, alpha) => {
        if (alpha <= 0.01) return;
        const cx = W * (kind === 'nova' ? 0.72 : 0.62), base = horizonY;
        const R0 = Math.min(W, H) * 0.24;
        const pulse = 1 + sig.kick * 0.035 * (0.4 + sig.energy);
        r.blend('add');
        if (kind === 'sun' || kind === 'rise') {
          const rise = kind === 'rise' ? 0.1 : 0;
          const cy = base - R0 * (0.25 + rise);
          const k = kind === 'rise' ? 0.55 : 0.78;
          r.glow(cx, cy, R0 * 3.2 * pulse, A(th.sun, 0.13 * alpha * k));
          r.disk(cx, cy, R0 * pulse, A(th.sun, 0.34 * alpha * k));
          // horizontal slits through the disc
          r.blend('alpha');
          for (let i = 0; i < 7; i++) {
            const yy = cy + R0 * (0.15 + i * 0.13);
            r.rect(cx - R0 * 1.1, yy, cx + R0 * 1.1, yy + R0 * (0.02 + i * 0.012), A(th.sky[2], alpha));
          }
          r.blend('add');
          if (kind === 'rise') {
            for (let i = 0; i < 16; i++) {
              const a = i / 16 * Math.PI * 2 + t * 0.05;
              r.line(cx, cy, cx + Math.cos(a) * R0 * 4, cy + Math.sin(a) * R0 * 4, R0 * 0.05, A(th.sun, 0.025 * alpha), A(th.sun, 0));
            }
          }
        } else if (kind === 'rings') {
          const cy = base - R0 * 0.6;
          r.glow(cx, cy, R0 * 2.6, A(th.sun, 0.1 * alpha));
          for (let i = 0; i < 6; i++) {
            const ph = ((sig.beat * 0.5 + i / 6) % 1);
            const rad = R0 * (0.3 + ph * 1.8);
            r.ring(cx, cy, rad, rad - 2.5 * r.scale, A(th.acc2, alpha * 0.5 * (1 - ph)));
          }
          r.disk(cx, cy, R0 * 0.32 * pulse, A(th.sun, 0.42 * alpha));
        } else if (kind === 'aurora') {
          for (let k = 0; k < 3; k++) {
            const col = k === 1 ? th.acc2 : th.acc;
            let prev = null;
            for (let i = 0; i <= 48; i++) {
              const x = i / 48 * W;
              const y = H * (0.18 + k * 0.07) + Math.sin(i * 0.25 + t * (0.3 + k * 0.1) + k) * H * 0.05 + Math.sin(i * 0.07 - t * 0.2) * H * 0.04;
              if (prev) {
                const hgt = H * (0.12 + 0.05 * Math.sin(i * 0.3 + t + k));
                r.quad(prev[0], prev[1], x, y, x, y + hgt, prev[0], prev[1] + prev[2], A(col, 0.0), A(col, 0.16 * alpha * (0.7 + sig.kick * 0.3)));
              }
              prev = [x, y, H * (0.12 + 0.05 * Math.sin(i * 0.3 + t + k))];
            }
          }
        } else if (kind === 'mirror') {
          const cy = base - R0 * 1.1;
          r.glow(cx, cy, R0 * 2.2, A(th.sun, 0.08 * alpha));
          r.ring(cx, cy, R0 * 0.6 * pulse, R0 * 0.57, A(th.sun, 0.35 * alpha));
          r.ring(cx, cy, R0 * 0.75, R0 * 0.74, A(th.sun, 0.15 * alpha));
          r.line(0, horizonY * 0.5, W, horizonY * 0.5, 1.5 * r.scale, A(th.acc, 0.15 * alpha));
        } else if (kind === 'nova') {
          const cy = base - R0 * 0.75;
          r.glow(cx, cy, R0 * 4 * pulse, A(th.sun, 0.12 * alpha));
          const rays = 24;
          for (let i = 0; i < rays; i++) {
            const a = i / rays * Math.PI * 2 + t * 0.15;
            const len = R0 * (2.5 + 1.5 * Math.sin(i * 7.3 + t * 2)) * (1 + sig.kick * 0.3);
            r.tri(cx, cy, cx + Math.cos(a - 0.03) * len, cy + Math.sin(a - 0.03) * len, cx + Math.cos(a + 0.03) * len, cy + Math.sin(a + 0.03) * len,
              A(th.sun, 0.14 * alpha), A(th.acc2, 0), A(th.acc2, 0));
          }
          for (let i = 0; i < 4; i++) {
            const ph = (sig.beat + i / 4) % 1;
            const rad = R0 * (0.2 + ph * 3);
            r.ring(cx, cy, rad, rad - 3 * r.scale, A(i % 2 ? th.acc2 : th.sun, alpha * 0.4 * (1 - ph)));
          }
          r.disk(cx, cy, R0 * 0.4 * pulse, A(th.sun, 0.5 * alpha));
        } else if (kind === 'moon') {
          const cy = H * 0.24;
          r.glow(cx, cy, R0 * 1.8, A(th.sun, 0.1 * alpha));
          r.ring(cx, cy, R0 * 0.42, R0 * 0.4, A(th.sun, 0.5 * alpha));
          r.disk(cx, cy, R0 * 0.38, A(th.sun, 0.12 * alpha));
        }
        r.blend('alpha');
      };
      const ka = w.a.celestial, kb = w.b.celestial;
      if (ka === kb) draw(kb, 1); else { draw(ka, 1 - w.k); draw(kb, w.k); }
    }

    // ── Ground, ceiling, corridor ────────────────────────────────────────
    function drawGround(th, view, cam, sig, ceil) {
      const x0 = view.left - 1, x1 = view.right + 1;
      const bottom = view.bottom - 1;
      r.rectV(x0, bottom, x1, 0, mul(th.ground, 0.6), th.ground);
      // perspective fan lines receding under the floor
      r.blend('add');
      const step = 2;
      const g0 = Math.floor(x0 / step) * step;
      for (let gx = g0; gx < x1 + 8; gx += step) {
        const vx = cam.x + (gx - cam.x) * 2.4;
        r.line(gx, 0, vx, bottom, 0.03, A(th.acc, 0.16), A(th.acc, 0));
      }
      for (let k = 1; k < 6; k++) {
        const yy = -Math.pow(k / 6, 1.6) * (0 - bottom);
        r.line(x0, yy, x1, yy, 0.025, A(th.acc, 0.1 * (1 - k / 6)));
      }
      // floor edge: the brightest line in the world
      const lineGlow = 0.7 + sig.kick * 0.3 * sig.energy;
      r.line(x0, 0, x1, 0, 0.07, A(mix(th.edge, [1, 1, 1, 1], 0.3), lineGlow));
      r.glow(cam.x, 0, view.halfW * 1.4, A(th.edge, 0.12), 0.6);
      r.blend('alpha');
      if (ceil < 100) {
        const top = view.top + 1;
        r.rectV(x0, ceil, x1, top, th.ground, mul(th.ground, 0.6));
        r.blend('add');
        for (let gx = g0; gx < x1 + 8; gx += step) {
          const vx = cam.x + (gx - cam.x) * 2.4;
          r.line(gx, ceil, vx, top, 0.03, A(th.acc, 0.16), A(th.acc, 0));
        }
        r.line(x0, ceil, x1, ceil, 0.07, A(mix(th.edge, [1, 1, 1, 1], 0.3), lineGlow));
        r.blend('alpha');
      }
    }

    // ── Level geometry ───────────────────────────────────────────────────
    function drawBlock(o, th, sig, t) {
      const { x0, x1, y0, y1 } = o;
      const top = Math.min(y1, 60), bot = Math.max(y0, -10);
      const pillar = o.style === 'pillar';
      const fill = pillar ? mix(th.fill, th.acc2, 0.1) : th.fill;
      const e = th.edge;
      // glassy body: darker at the base, a lit band under the top edge
      r.rectV(x0, bot, x1, top, mul(fill, 0.7), mix(fill, e, 0.16));
      r.blend('add');
      const w = x1 - x0, h = top - bot;
      // diagonal light lines inside, clipped to the block
      if (w > 0.6 && h > 0.6) {
        const gap = 0.9;
        const a = A(e, 0.07);
        for (let d = -h; d < w; d += gap) {
          const ax = Math.max(x0, x0 + d), ay = bot + (ax - (x0 + d));
          const bx = Math.min(x1, x0 + d + h), by = bot + (bx - (x0 + d));
          if (bx - ax > 0.05) r.line(ax, ay, bx, by, 0.03, a);
        }
      }
      const pulse = 0.6 + 0.4 * sig.kick;
      r.polyline([[x0, bot], [x1, bot], [x1, top], [x0, top]], 0.055, A(e, 0.6 * pulse), true);
      // the surfaces you can land on are the brightest
      if (y1 < 60) { r.line(x0, top, x1, top, 0.09, A(mix(e, [1, 1, 1, 1], 0.4), 0.9 * pulse)); r.glow((x0 + x1) / 2, top, Math.max(0.8, w * 0.6), A(e, 0.12), 0.35); }
      if (y0 > -5) r.line(x0, bot, x1, bot, 0.07, A(e, 0.6 * pulse));
      r.blend('alpha');
    }

    function drawSpike(s, sig) {
      const { cx, by, dir, w, h } = s;
      const hw = w / 2;
      const tip = by + h * dir;
      r.tri(cx - hw, by, cx + hw, by, cx, tip, HAZ.fill, HAZ.fill, mul(HAZ.edge, 0.55));
      r.blend('add');
      const e = A(HAZ.edge, 0.9 + sig.kick * 0.1);
      r.line(cx - hw, by, cx, tip, 0.07, e);
      r.line(cx + hw, by, cx, tip, 0.07, e);
      r.line(cx - hw, by, cx + hw, by, 0.05, A(HAZ.edge, 0.5));
      const k = 0.42;
      r.tri(cx - hw * k, by + h * 0.08 * dir, cx + hw * k, by + h * 0.08 * dir, cx, by + h * (0.08 + 0.5) * dir, A(HAZ.core, 0.85));
      r.glow(cx, by + h * 0.35 * dir, 0.9, A(HAZ.edge, 0.22));
      r.blend('alpha');
    }

    function drawWall(wl, th, sig) {
      r.poly(wl.pts, mix(HAZ.fill, th.fill, 0.55));
      r.blend('add');
      // glow on the edges that face the channel (not the floor/ceiling sides)
      const pts = wl.pts;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const onBound = (Math.abs(a[1]) < 0.01 && Math.abs(b[1]) < 0.01) || (a[1] >= 8.99 && b[1] >= 8.99);
        if (onBound || a[0] === b[0]) continue;
        r.line(a[0], a[1], b[0], b[1], 0.09, A(HAZ.edge, 0.95));
        r.line(a[0], a[1], b[0], b[1], 0.03, A(HAZ.core, 0.9));
      }
      r.blend('alpha');
    }

    function drawSaw(o, t) {
      const n = 10, R = o.vr;
      const a0 = t * 6 * o.spin;
      const pts = [];
      for (let i = 0; i < n * 2; i++) {
        const a = a0 + i / (n * 2) * Math.PI * 2;
        const rr = i % 2 ? R * 0.78 : R;
        pts.push([o.cx + Math.cos(a) * rr, o.cy + Math.sin(a) * rr]);
      }
      r.poly([[o.cx, o.cy], ...pts, pts[0]], HAZ.fill);
      r.blend('add');
      r.polyline(pts, 0.07, A(HAZ.edge, 0.95), true);
      r.ring(o.cx, o.cy, R * 0.4, R * 0.3, A(HAZ.core, 0.9));
      r.glow(o.cx, o.cy, R * 1.8, A(HAZ.edge, 0.25));
      r.blend('alpha');
    }

    function drawTrigger(o, i, s, t, sig) {
      const used = s && s.used[i];
      if (o.orb) {
        const c = ORB_COLOR[o.kind] || ORB_COLOR.orb;
        const near = s ? Math.max(0, 1 - Math.abs(s.x - o.cx) / 6) : 0;
        r.blend('add');
        r.glow(o.cx, o.cy, 1.6 + sig.kick * 0.3, A(c, used ? 0.1 : 0.35));
        r.ring(o.cx, o.cy, 0.48, 0.36, A(c, used ? 0.3 : 1));
        r.disk(o.cx, o.cy, 0.24, A(c, used ? 0.2 : 0.8));
        if (!used) {
          const ph = (t * 2) % 1;
          r.ring(o.cx, o.cy, 0.5 + ph * 0.6, 0.46 + ph * 0.6, A(c, 0.5 * (1 - ph) * (0.4 + near)));
        }
        if (o.kind === 'gravorb') {
          r.line(o.cx, o.cy - 0.18, o.cx, o.cy + 0.18, 0.06, [1, 1, 1, 0.9]);
        }
        r.blend('alpha');
      } else if (o.pad) {
        const c = PAD_COLOR[o.kind] || PAD_COLOR.pad;
        const d = o.down ? -1 : 1;
        const y = o.cy;
        r.quad(o.cx - 0.45, y, o.cx + 0.45, y, o.cx + 0.3, y + 0.22 * d, o.cx - 0.3, y + 0.22 * d, A(c, used ? 0.5 : 1));
        r.blend('add');
        r.glow(o.cx, y + 0.3 * d, 1.1, A(c, 0.35));
        r.quad(o.cx - 0.35, y, o.cx + 0.35, y, o.cx + 0.2, y + 2.2 * d, o.cx - 0.2, y + 2.2 * d, A(c, 0.22), A(c, 0));
        r.blend('alpha');
      }
    }

    function drawPortal(p, view, t, s) {
      let col, icon;
      if (p.kind === 'mode') { col = PORTAL_COLOR[p.mode]; icon = p.mode; }
      else if (p.kind === 'gravity') { col = p.grav < 0 ? PORTAL_COLOR.flip : PORTAL_COLOR.normal; icon = p.grav < 0 ? 'up' : 'down'; }
      else { col = hex(p.speed === 'slow' ? '#7fb2ff' : p.speed === 'fast' ? '#ffb84d' : '#ff6b3d'); icon = 'speed'; }
      const x = p.x;
      const passed = s && s.x > x;
      const y0 = view.bottom - 1, y1 = view.top + 1;
      r.blend('add');
      // a sheet of light, brightest at the gate
      r.quad(x - 1.6, y0, x, y0, x, y1, x - 1.6, y1, A(col, 0), A(col, passed ? 0.06 : 0.16));
      r.quad(x, y0, x + 0.5, y0, x + 0.5, y1, x, y1, A(col, passed ? 0.1 : 0.3), A(col, 0));
      r.line(x, y0, x, y1, 0.12, A(col, passed ? 0.4 : 0.95));
      r.line(x, y0, x, y1, 0.04, [1, 1, 1, passed ? 0.3 : 0.9]);
      // icon in the middle of the view
      const cy = (view.bottom + view.top) / 2;
      const k = 0.7;
      const w = [1, 1, 1, passed ? 0.3 : 0.95];
      r.glow(x, cy, 2.2, A(col, 0.35));
      if (icon === 'ship') r.polyline([[x - 0.6 * k, cy - 0.35 * k], [x + 0.7 * k, cy], [x - 0.6 * k, cy + 0.35 * k], [x - 0.3 * k, cy]], 0.09, w, true);
      else if (icon === 'wave') r.polyline([[x - 0.8 * k, cy - 0.3 * k], [x - 0.3 * k, cy + 0.3 * k], [x + 0.2 * k, cy - 0.3 * k], [x + 0.7 * k, cy + 0.3 * k]], 0.09, w);
      else if (icon === 'cube') r.polyline([[x - 0.4 * k, cy - 0.4 * k], [x + 0.4 * k, cy - 0.4 * k], [x + 0.4 * k, cy + 0.4 * k], [x - 0.4 * k, cy + 0.4 * k]], 0.09, w, true);
      else if (icon === 'up' || icon === 'down') {
        const d = icon === 'up' ? 1 : -1;
        r.polyline([[x - 0.45 * k, cy - 0.1 * d], [x, cy + 0.45 * d], [x + 0.45 * k, cy - 0.1 * d]], 0.1, w);
        r.line(x, cy + 0.4 * d, x, cy - 0.6 * d, 0.1, w);
      } else {
        for (let i = 0; i < (p.speed === 'slow' ? 1 : p.speed === 'fast' ? 2 : 3); i++) {
          const ox = x - 0.3 + i * 0.35;
          r.polyline([[ox - 0.2, cy + 0.4], [ox + 0.15, cy], [ox - 0.2, cy - 0.4]], 0.1, w);
        }
      }
      r.blend('alpha');
    }

    // ── Player ───────────────────────────────────────────────────────────
    function drawPlayer(s, vis, t, sig) {
      if (s.dead) return;
      const col = MODE_COLOR[s.mode];
      const [hw, hh] = L.PHYS.box[s.mode];
      // trail
      r.blend('add');
      const tr = vis.trail;
      if (s.mode === 'wave') {
        for (let i = 1; i < tr.length; i++) {
          const a = i / tr.length;
          r.line(tr[i - 1][0], tr[i - 1][1], tr[i][0], tr[i][1], 0.22 * a + 0.05, A(col, 0.7 * a));
          r.line(tr[i - 1][0], tr[i - 1][1], tr[i][0], tr[i][1], 0.07, [1, 1, 1, 0.6 * a]);
        }
      } else {
        for (let i = 1; i < tr.length; i++) {
          const a = i / tr.length;
          r.line(tr[i - 1][0], tr[i - 1][1], tr[i][0], tr[i][1], (hh * 1.2) * a, A(col, 0.35 * a * a));
        }
      }
      r.glow(s.x, s.y, 2.2, A(col, 0.4 + 0.15 * sig.kick));
      r.blend('alpha');
      const x = s.x, y = s.y;
      // a dark rim keeps the player readable against bright skies
      const rim = [0.02, 0.02, 0.08, 0.85];
      if (s.mode === 'cube') {
        const a = vis.rot;
        const c = Math.cos(a), sn = Math.sin(a);
        const P = (u, v) => [x + u * c - v * sn, y + u * sn + v * c];
        const sq = (k) => [P(-hw * k, -hh * k), P(hw * k, -hh * k), P(hw * k, hh * k), P(-hw * k, hh * k)];
        const o = sq(1), m = sq(0.62), i = sq(0.3), rr = sq(1.16);
        r.quad(...rr[0], ...rr[1], ...rr[2], ...rr[3], rim);
        r.quad(...o[0], ...o[1], ...o[2], ...o[3], [1, 1, 1, 1]);
        r.quad(...sq(0.86)[0], ...sq(0.86)[1], ...sq(0.86)[2], ...sq(0.86)[3], mix(col, [0.05, 0.08, 0.2, 1], 0.55));
        r.quad(...m[0], ...m[1], ...m[2], ...m[3], col);
        r.quad(...i[0], ...i[1], ...i[2], ...i[3], [1, 1, 1, 1]);
      } else if (s.mode === 'ship') {
        const a = Math.atan2(s.vy * 0.55, s.speed);
        const c = Math.cos(a), sn = Math.sin(a);
        const P = (u, v) => [x + u * c - v * sn, y + u * sn + v * c];
        r.poly([P(0.95, 0), P(-0.7, 0.55), P(-0.45, 0), P(-0.7, -0.55)], rim);
        const hull = [P(0.75, 0), P(-0.55, 0.4), P(-0.35, 0), P(-0.55, -0.4)];
        r.poly(hull, [1, 1, 1, 1]);
        const inner = [P(0.45, 0), P(-0.35, 0.22), P(-0.22, 0), P(-0.35, -0.22)];
        r.poly(inner, col);
        // the cube pilot rides on top
        const q = [P(-0.3, 0.12), P(0.05, 0.12), P(0.05, 0.47), P(-0.3, 0.47)];
        r.quad(...q[0], ...q[1], ...q[2], ...q[3], [1, 1, 1, 1]);
        const q2 = [P(-0.22, 0.2), P(-0.03, 0.2), P(-0.03, 0.39), P(-0.22, 0.39)];
        r.quad(...q2[0], ...q2[1], ...q2[2], ...q2[3], col);
      } else {
        const up = s.vy > 0 ? 1 : -1;
        const a = Math.atan2(s.vy, s.speed);
        const c = Math.cos(a), sn = Math.sin(a);
        const P = (u, v) => [x + u * c - v * sn, y + u * sn + v * c];
        r.poly([P(0.62, 0), P(-0.48, 0.42), P(-0.25, 0), P(-0.48, -0.42)], rim);
        r.poly([P(0.45, 0), P(-0.35, 0.3), P(-0.18, 0), P(-0.35, -0.3)], [1, 1, 1, 1]);
        r.poly([P(0.25, 0), P(-0.2, 0.15), P(-0.1, 0), P(-0.2, -0.15)], col);
        void up;
      }
    }

    function drawParticles(parts) {
      r.blend('add');
      for (const p of parts) {
        const a = Math.max(0, p.life / p.max);
        if (p.kind === 'ring') {
          const rad = p.size + (1 - a) * p.grow;
          r.ring(p.x, p.y, rad, Math.max(0.01, rad - p.w * a), A(p.c, a * p.alpha));
        } else if (p.kind === 'shard') {
          const s = p.size * (0.5 + a * 0.5);
          const c = Math.cos(p.rot), sn = Math.sin(p.rot);
          r.tri(p.x + c * s, p.y + sn * s, p.x - sn * s * 0.5, p.y + c * s * 0.5, p.x + sn * s * 0.5, p.y - c * s * 0.5, A(p.c, a));
        } else {
          r.disk(p.x, p.y, p.size * (0.4 + 0.6 * a), A(p.c, a * (p.alpha || 1)));
        }
      }
      r.blend('alpha');
    }

    // ── Frame ────────────────────────────────────────────────────────────
    const world = L.World(r, lv);
    let ceilW = 0;

    sc.draw = function (f) {
      const { s, cam, t, sig, vis, parts, W, H, debug } = f;
      const w = themeAt(lv, t);
      const th = blendTheme(w);
      sc.theme = th; sc.themeKey = w.b.name;
      const weights = {};
      weights[w.a.name] = (weights[w.a.name] || 0) + (1 - w.k);
      weights[w.b.name] = (weights[w.b.name] || 0) + w.k;
      const zoom = cam.zoom;
      const view = { halfW: W / 2 / zoom, halfH: H / 2 / zoom, zoomPx: zoom };
      view.left = cam.x - view.halfW; view.right = cam.x + view.halfW;
      view.bottom = cam.y - view.halfH; view.top = cam.y + view.halfH;
      const horizonPx = H * L.HORIZON;
      const ceil = isFinite(cam.ceilVis) && cam.ceilVis < 100 ? cam.ceilVis : Infinity;
      ceilW += ((isFinite(ceil) ? 1 : 0) - ceilW) * 0.08;
      r.begin(mul(th.sky[0], 1));
      drawSky(th, W, H, horizonPx, sig, w);
      drawStars(th, cam, W, H, t);
      drawCelestial(w, th, W, H, horizonPx, t, sig);
      r.view(cam.x, cam.y, zoom, cam.rot);
      world.draw({ cam, view, t, sig, th, weights, ceilW, ceil: isFinite(ceil) ? ceil : sc.lastCeil || 9 });
      if (isFinite(ceil)) sc.lastCeil = ceil;
      drawGround(th, view, cam, sig, ceil);
      // Reflections in the glass floor: the player and nearby blocks, flipped.
      if (s && !s.dead && s.y < 8) {
        r.view(cam.x, cam.y, zoom, cam.rot, true);
        r.alpha = 0.3;
        drawPlayer(s, Object.assign({}, vis, { trail: [] }), t, sig);
        visible(solids, view.left, view.right, maxW.solids, o => { if (o.y0 < 0.01) drawBlock(o, th, sig, t); });
        visible(spikes, view.left, view.right, 1, o => { if (o.by < 0.01 && o.dir > 0) drawSpike(o, sig); });
        r.alpha = 1;
        r.view(cam.x, cam.y, zoom, cam.rot);
        r.rectV(view.left - 1, view.bottom - 1, view.right + 1, 0, A(th.ground, 0.95), A(th.ground, 0.25));
      }
      visible(walls, view.left, view.right, maxW.walls, o => drawWall(o, th, sig));
      visible(solids, view.left, view.right, maxW.solids, o => drawBlock(o, th, sig, t));
      visible(spikes, view.left, view.right, 1, o => drawSpike(o, sig));
      visible(saws, view.left, view.right, 3, o => drawSaw(o, t));
      visible(trigs, view.left, view.right, 2, (o, i) => drawTrigger(o, i, s, t, sig));
      visible(portals, view.left, view.right, 2, o => drawPortal(o, view, t, s));
      // your best so far, a thin gold line across the world
      if (f.bestX !== null && f.bestX !== undefined && f.bestX > view.left - 1 && f.bestX < view.right + 1 && s) {
        r.blend('add');
        r.line(f.bestX, view.bottom - 1, f.bestX, view.top + 1, 0.06, [1, 0.85, 0.3, 0.55]);
        r.quad(f.bestX - 1.2, view.bottom - 1, f.bestX, view.bottom - 1, f.bestX, view.top + 1, f.bestX - 1.2, view.top + 1, [1, 0.85, 0.3, 0], [1, 0.85, 0.3, 0.08]);
        const yy = Math.min(view.top - 1, 10);
        r.poly([[f.bestX, yy + 0.3], [f.bestX + 0.3, yy], [f.bestX, yy - 0.3], [f.bestX - 0.3, yy]], [1, 0.85, 0.3, 0.9]);
        r.blend('alpha');
      }
      // finish gate
      if (lv.endX < view.right + 4) {
        // the gate of light at the end: a bright seam, a sheet of glow
        // behind it, and rings breathing with the music
        const X = lv.endX, y0 = view.bottom - 1, y1 = view.top + 1, cy = (view.bottom + view.top) / 2;
        const c = th.sun;
        r.blend('add');
        r.quad(X - 4, y0, X, y0, X, y1, X - 4, y1, A(c, 0), A(c, 0.35));
        r.quad(X, y0, X + 10, y0, X + 10, y1, X, y1, A(c, 0.25), A(c, 0));
        r.line(X, y0, X, y1, 0.3, A(c, 0.6));
        r.line(X, y0, X, y1, 0.1, [1, 1, 1, 1]);
        for (let i = 0; i < 4; i++) {
          const ph = (sig.beat * 0.5 + i / 4) % 1;
          const rad = 0.6 + ph * 7;
          r.ring(X, cy, rad, rad - 0.12, A(i % 2 ? th.acc2 : c, 0.5 * (1 - ph)));
        }
        r.blend('alpha');
      }
      if (s && s.x < lv.endX + 0.3) drawPlayer(s, vis, t, sig);
      drawParticles(parts);
      if (debug && s) {
        r.blend('alpha');
        const [hw, hh] = L.PHYS.box[s.mode];
        r.polyline([[s.x - hw, s.y - hh], [s.x + hw, s.y - hh], [s.x + hw, s.y + hh], [s.x - hw, s.y + hh]], 0.03, [0, 1, 0, 1], true);
        for (const h of lv.hazards) {
          if (h.x1 < view.left || h.x0 > view.right) continue;
          if (h.r) r.ring(h.cx, h.cy, h.r, h.r - 0.03, [1, 1, 0, 1]);
          else r.polyline([[h.x0, h.y0], [h.x1, h.y0], [h.x1, h.y1], [h.x0, h.y1]], 0.02, [1, 1, 0, 0.8], true);
        }
      }
      void ceil;
      return view;
    };
    return sc;
  };
})(globalThis.LUMINAL = globalThis.LUMINAL || {});
