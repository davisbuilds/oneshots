// crane.js: ship-to-shore crane kinematics.
//
// A crane cycle is three overlapping one-dimensional motions of the
// spreader: hoist up, trolley across, hoist down, each with a trapezoidal
// velocity profile (accelerate, cruise, brake), plus fixed times to lock and
// unlock the twistlocks and to land a box gently. Speeds are those of a
// typical Panamax-class crane: trolley 4 m/s, hoist 1.2 m/s loaded and
// 2.4 m/s empty, 0.6 m/s^2 for both; gantry travel 0.75 m/s.
'use strict';
(function (TL) {
  const K = {
    trolleyV: 4.0, trolleyA: 0.6,
    hoistVLoaded: 1.2, hoistVEmpty: 2.4, hoistA: 0.6,
    gantryV: 0.75, gantryA: 0.25,
    lock: 5, unlock: 5, land: 4,        // seconds
    overlapLift: 0.7,                   // trolley starts when the lift is 70% done
    overlapLower: 0.8,                  // lowering starts when the trolley is 80% done
    clearance: 4.0,                     // spreader + box clear of stacks by this, m
    parkZ: 22,                          // idle spreader height over the lanes, m
  };

  // Trapezoidal (or triangular) profile for distance d.
  function profile(d, v, a) {
    d = Math.abs(d);
    if (d < 1e-6) return { T: 0, d, v, a, tri: true, ta: 0 };
    if (d >= v * v / a) return { T: d / v + v / a, d, v, a, tri: false, ta: v / a };
    const ta = Math.sqrt(d / a);
    return { T: 2 * ta, d, v: a * ta, a, tri: true, ta };
  }
  // Fraction of the distance covered at time t into the profile.
  function frac(p, t) {
    if (p.T === 0) return 1;
    if (t <= 0) return 0;
    if (t >= p.T) return 1;
    const { a, v, ta, d, T } = p;
    let s;
    if (t < ta) s = 0.5 * a * t * t;
    else if (t > T - ta) { const r = T - t; s = d - 0.5 * a * r * r; }
    else s = 0.5 * a * ta * ta + v * (t - ta);
    return s / d;
  }

  // Build one move of the spreader from (y0, z0) to (y1, z1) passing over
  // obstacles no higher than zTop. Returns segments for evaluation and the
  // total duration. loaded: hoist speeds.
  function move(y0, z0, y1, z1, zTop, loaded, tStart) {
    const zs = Math.max(zTop + K.clearance, z0, z1);
    const v = loaded ? K.hoistVLoaded : K.hoistVEmpty;
    const up = profile(zs - z0, v, K.hoistA);
    const tr = profile(y1 - y0, K.trolleyV, K.trolleyA);
    const dn = profile(zs - z1, v, K.hoistA);
    const tUp = tStart;
    const tTr = tUp + up.T * K.overlapLift;
    const tDn = tTr + tr.T * K.overlapLower;
    // The last 1.5 m of a descent is a slow landing.
    const end = Math.max(tDn + dn.T + K.land, tTr + tr.T, tUp + up.T);
    return { y0, z0, y1, z1, zs, up, tr, dn, tUp, tTr, tDn, end };
  }
  function evalMove(m, t) {
    const fu = frac(m.up, t - m.tUp), ft = frac(m.tr, t - m.tTr);
    // Landing: the descent profile is stretched over its last metres.
    let fd = frac(m.dn, t - m.tDn);
    const y = m.y0 + (m.y1 - m.y0) * ft;
    const z = m.z0 + (m.zs - m.z0) * fu - (m.zs - m.z1) * fd;
    return { y, z };
  }

  // Gantry: a straight run along the rail.
  function gantry(x0, x1, tStart) {
    const p = profile(x1 - x0, K.gantryV, K.gantryA);
    return { x0, x1, p, t0: tStart, end: tStart + p.T };
  }
  function evalGantry(g, t) { return g.x0 + (g.x1 - g.x0) * frac(g.p, t - g.t0); }

  // Spreader position through a whole cycle: to the pick (m1), the loaded
  // move (m2), and the empty climb back to park height (m3).
  function evalCycle(c, t) {
    const m = t < c.tLock ? c.m1 : t < c.m3.tUp ? c.m2 : c.m3;
    return evalMove(m, Math.min(t, m.end));
  }

  TL.Crane = { K, profile, frac, move, evalMove, evalCycle, gantry, evalGantry };
})(globalThis.TL = globalThis.TL || {});
