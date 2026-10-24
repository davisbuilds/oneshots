// stability.js: loading condition -> drafts, trim, list, GM and the IMO
// intact-stability criteria.
//
// Methods (all classical, see Barrass and Derrett, "Ship Stability for
// Masters and Mates", 7th ed., 2012; Rawson and Tupper, "Basic Ship Theory",
// 5th ed., 2001):
//   - mean draft from the displacement on the hull's hydrostatic table;
//   - trim = W (LCB - LCG) / (100 MCTC), shared about the LCF;
//   - GM = KB + BM - KG - FSC, with the free-surface correction
//     FSC = sum(i rho) / W for slack tanks;
//   - righting levers GZ = KN - KG sin(phi) from cross curves computed by
//     integrating the heeled hull directly (constant displacement, free to
//     sink, trim neglected);
//   - list: the angle where GZ equals the heeling lever TCG cos(phi), which for
//     small angles is Barrass's tan(theta) = GG1 / GM;
//   - IMO Intact Stability Code 2008 (resolution MSC.267(85)), Part A 2.2:
//     GM0 >= 0.15 m; area under GZ to 30 deg >= 0.055 m rad, to 40 deg >=
//     0.090, between 30 and 40 deg >= 0.030; GZ >= 0.20 m at 30 deg or more;
//     maximum GZ at 25 deg or more.
'use strict';
(function (TL) {
  const DEG = Math.PI / 180;
  const ANGLES = [0, 1, 2, 3, 4, 5, 7.5, 10, 12.5, 15, 20, 25, 30, 35, 40, 45, 50, 60];

  // Cross curves (KN) for a hull, by integrating immersed sections of the
  // heeled hull on a grid of stations and horizontal strips.
  function crossCurves(hull) {
    const nx = 49, nz = 96;
    const x0 = hull.xAft, x1 = hull.xFwd, hx = (x1 - x0) / (nx - 1), dz = hull.D / nz;
    const hb = [];
    for (let i = 0; i < nx; i++) {
      const row = new Float64Array(nz);
      for (let k = 0; k < nz; k++) row[k] = hull.halfBreadth(x0 + i * hx, (k + 0.5) * dz);
      hb.push(row);
    }
    const sect = new Float64Array(nx), sy = new Float64Array(nx), sz = new Float64Array(nx);
    // Immersed volume and its moments for a waterline z = c + y tan(phi).
    function immersed(c, t) {
      for (let i = 0; i < nx; i++) {
        const row = hb[i];
        let a = 0, my = 0, mz = 0;
        for (let k = 0; k < nz; k++) {
          const h = row[k];
          if (h <= 0) continue;
          const z = (k + 0.5) * dz;
          let y0;
          if (t === 0) y0 = z < c ? -h : h;
          else y0 = TL.clamp((z - c) / t, -h, h);
          const l = h - y0;
          if (l <= 0) continue;
          a += l * dz; my += (h * h - y0 * y0) / 2 * dz; mz += z * l * dz;
        }
        sect[i] = a; sy[i] = my; sz[i] = mz;
      }
      const V = TL.simpson(Array.from(sect), hx);
      return { V, My: TL.simpson(Array.from(sy), hx), Mz: TL.simpson(Array.from(sz), hx) };
    }
    const top = hull.table[hull.table.length - 1].disp;
    const disps = [];
    for (let k = 0; k < 12; k++) disps.push(top * (0.28 + 0.72 * k / 11));
    const KN = [];
    for (const W of disps) {
      const Vt = W / TL.RHO, row = [];
      for (const a of ANGLES) {
        if (a === 0) { row.push(0); continue; }
        const t = Math.tan(a * DEG);
        let lo = -hull.B * t, hi = hull.D + hull.B * t;
        for (let it = 0; it < 30; it++) {
          const mid = (lo + hi) / 2;
          if (immersed(mid, t).V < Vt) lo = mid; else hi = mid;
        }
        const r = immersed((lo + hi) / 2, t);
        const yB = r.My / r.V, zB = r.Mz / r.V;
        row.push(yB * Math.cos(a * DEG) + zB * Math.sin(a * DEG));
      }
      KN.push(row);
    }
    return { disps, angles: ANGLES, KN };
  }

  // KN at a displacement, for every tabulated angle.
  function knAt(cc, W) {
    const d = cc.disps;
    let i = 0;
    while (i < d.length - 2 && W > d[i + 1]) i++;
    const t = TL.clamp((W - d[i]) / (d[i + 1] - d[i]), -0.5, 1.5);
    return cc.KN[i].map((v, k) => v + (cc.KN[i + 1][k] - v) * t);
  }

  // GZ at any angle (degrees, signed) by linear interpolation of the curve.
  function gzAt(curve, deg) {
    const s = Math.sign(deg) || 1, a = Math.abs(deg);
    const A = ANGLES;
    if (a >= A[A.length - 1]) return s * curve[curve.length - 1];
    let i = 0;
    while (A[i + 1] < a) i++;
    const t = (a - A[i]) / (A[i + 1] - A[i]);
    return s * (curve[i] + (curve[i + 1] - curve[i]) * t);
  }

  // Area under GZ (metre-radians) between two angles in degrees.
  function area(curve, a0, a1) {
    const n = 40, h = (a1 - a0) / n, ys = [];
    for (let i = 0; i <= n; i++) ys.push(gzAt(curve, a0 + i * h));
    return TL.simpson(ys, h * DEG);
  }

  const LIMITS = {
    gmMin: 0.15,          // IMO IS Code 2008, A 2.2.4
    heelOps: 2.0,         // list allowed while cranes work (cell guides), degrees
    heelDepart: 0.5,      // list allowed on sailing, degrees
    trimMax: 2.0,         // |trim| shown on the gauge range, metres
    ukcFrac: 0.10,        // under-keel clearance at berth: 10% of draft ...
    ukcMin: 0.6,          // ... and never less than 0.6 m
  };

  // sums: { W, Mx, My, Mz, FSM } of every weight on board (lightship,
  // tanks, cargo); x from AP, y to starboard, z from keel. FSM in t m.
  function condition(vessel, sums, opts = {}) {
    const hull = vessel.hull;
    const W = sums.W;
    const LCG = sums.Mx / W, TCG = sums.My / W, KG = sums.Mz / W;
    const over = W > hull.maxDisp;
    const h = hull.atDisp(Math.min(W, hull.maxDisp));
    const trim = W * (h.LCB - LCG) / (100 * h.MCTC);      // + by the stern
    const Ta = h.T + trim * (h.LCF / hull.L);
    const Tf = h.T - trim * ((hull.L - h.LCF) / hull.L);
    const FSC = (sums.FSM || 0) / W;
    const GMsolid = h.KMT - KG;
    const GM = GMsolid - FSC;
    const KGf = KG + FSC;
    const cc = vessel.cross || (vessel.cross = crossCurves(hull));
    const kn = knAt(cc, W);
    const curve = ANGLES.map((a, i) => kn[i] - KGf * Math.sin(a * DEG));
    // Small angles from the hydrostatic GM so the curve starts at the right slope.
    for (let i = 1; i < ANGLES.length && ANGLES[i] <= 5; i++) {
      const s = Math.sin(ANGLES[i] * DEG);
      const w = ANGLES[i] / 5;
      curve[i] = (1 - w) * GM * s + w * curve[i];
    }
    // List: GZ(theta) = TCG cos(theta), searched on a fine grid then refined.
    let heel = 0;
    if (Math.abs(TCG) > 1e-9 || GM < 0) {
      const f = (d) => gzAt(curve, d) - TCG * Math.cos(d * DEG);
      // Small-angle answer first (Barrass): exact enough while GM is healthy.
      if (GM > 0.05) heel = Math.atan(TCG / GM) / DEG;
      if (GM <= 0.05 || Math.abs(heel) > 4) {
        const sgn = TCG === 0 ? 1 : Math.sign(TCG);
        let a = 0, fa = f(0), found = false;
        for (let d = 0.25; d <= 45; d += 0.25) {
          const fb = f(sgn * d);
          if ((fa <= 0 && fb >= 0) || (fa >= 0 && fb <= 0)) {
            let lo = a, hi = sgn * d;
            for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if ((f(lo) <= 0) === (f(m) <= 0)) lo = m; else hi = m; }
            heel = (lo + hi) / 2; found = true; break;
          }
          a = sgn * d; fa = fb;
        }
        if (!found) heel = sgn * 45;
      }
    }
    const a30 = area(curve, 0, 30), a40 = area(curve, 0, 40), a3040 = area(curve, 30, 40);
    let gzMax = -1e9, angMax = 0;
    for (let d = 0; d <= 60; d += 0.5) { const g = gzAt(curve, d); if (g > gzMax) { gzMax = g; angMax = d; } }
    const gz30 = gzAt(curve, 30);
    const crit = [
      { id: 'gm0', label: 'GM₀ ≥ 0.15 m', value: GM, min: 0.15, ok: GM >= 0.15 },
      { id: 'a30', label: 'Area 0–30° ≥ 0.055 m·rad', value: a30, min: 0.055, ok: a30 >= 0.055 },
      { id: 'a40', label: 'Area 0–40° ≥ 0.090 m·rad', value: a40, min: 0.09, ok: a40 >= 0.09 },
      { id: 'a3040', label: 'Area 30–40° ≥ 0.030 m·rad', value: a3040, min: 0.03, ok: a3040 >= 0.03 },
      { id: 'gz30', label: 'GZ at 30° ≥ 0.20 m', value: gz30, min: 0.2, ok: gz30 >= 0.2 },
      { id: 'angmax', label: 'Max GZ at ≥ 25°', value: angMax, min: 25, ok: angMax >= 25 },
    ];
    const isCodeOk = crit.every(c => c.ok);
    const deckEdge = Math.atan((hull.D - h.T) / (hull.B / 2)) / DEG;
    return {
      W, LCG, TCG, KG, KGf, FSC, GMsolid, GM, heel, trim, Ta, Tf, Tmean: (Ta + Tf) / 2, T: h.T,
      maxDraft: Math.max(Ta, Tf), KB: h.KB, BMT: h.BMT, KMT: h.KMT, LCB: h.LCB, LCF: h.LCF, MCTC: h.MCTC, TPC: h.TPC,
      curve, angles: ANGLES, crit, isCodeOk, overloaded: over, deckEdge, gzMax, angMax,
    };
  }

  // Classify a condition against operational limits. Returns the worst state
  // ('ok' | 'near' | 'out') and the reasons.
  function assess(c, opts = {}) {
    const L = Object.assign({}, LIMITS, opts.limits || {});
    const heelLim = opts.departure ? L.heelDepart : L.heelOps;
    const out = [], near = [];
    if (c.overloaded) out.push('displacement exceeds the hull at deck level');
    if (c.GM < L.gmMin) out.push(`GM ${c.GM.toFixed(2)} m below ${L.gmMin.toFixed(2)} m`);
    else if (c.GM < L.gmMin + 0.35) near.push(`GM ${c.GM.toFixed(2)} m`);
    if (!c.isCodeOk) for (const k of c.crit) if (!k.ok && k.id !== 'gm0') out.push(`IS Code: ${k.label}`);
    if (Math.abs(c.heel) > heelLim) out.push(`list ${Math.abs(c.heel).toFixed(1)}° beyond ${heelLim.toFixed(1)}°`);
    else if (Math.abs(c.heel) > heelLim * 0.7) near.push(`list ${Math.abs(c.heel).toFixed(1)}°`);
    if (Math.abs(c.trim) > L.trimMax) out.push(`trim ${c.trim.toFixed(2)} m beyond ±${L.trimMax.toFixed(1)} m`);
    else if (Math.abs(c.trim) > L.trimMax * 0.75) near.push(`trim ${c.trim.toFixed(2)} m`);
    if (opts.depth != null) {
      const need = c.maxDraft + Math.max(L.ukcMin, L.ukcFrac * c.maxDraft);
      if (need > opts.depth) out.push(`draft ${c.maxDraft.toFixed(2)} m needs ${need.toFixed(1)} m of water; berth has ${opts.depth.toFixed(1)} m`);
    }
    return { state: out.length ? 'out' : near.length ? 'near' : 'ok', out, near };
  }

  TL.Stability = { crossCurves, knAt, gzAt, area, condition, assess, LIMITS, ANGLES };
})(globalThis.TL = globalThis.TL || {});
