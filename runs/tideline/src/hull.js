// hull.js: one parametric hull form, and its hydrostatics by direct integration.
//
// The same half-breadth function y(x, z) feeds three things: the hydrostatic
// table (this file), the slots that fit in the holds (vessel.js) and the mesh
// the renderer draws. A ship's particulars therefore cannot contradict its
// shape.
//
// Method: the classical one, as in Rawson and Tupper, "Basic Ship Theory"
// (5th ed., 2001), ch. 2-3, and Barrass and Derrett, "Ship Stability for
// Masters and Mates" (7th ed., 2012), ch. 4-7. For each waterline the
// waterplane area, its centroid (LCF) and its second moments (I_T, I_L) are
// integrated along the length by Simpson's first rule; volume, KB and LCB
// follow by integrating the waterplanes up the draft. BM = I / volume.
// x is measured forward from the aft perpendicular (AP), z up from the keel,
// y to starboard. Units: metres, tonnes.
'use strict';
(function (TL) {
  const RHO = 1.025;            // sea water, t/m^3

  class Hull {
    // p: { L: length between perpendiculars, B: moulded beam, D: depth to
    //      main deck, T: design draft, aftOver / foreOver: overhangs beyond
    //      AP / FP (they make LOA), box: true for a rectangular barge }
    constructor(p) {
      this.p = Object.assign({ aftOver: 0, foreOver: 0, box: false, midAft: 0.30, midFwd: 0.60, transom: 0.30, sMid: 30, sEnd: 0.6, sAft: 0.5, sFwd: 0.5 }, p);
      const q = this.p;
      this.L = q.L; this.B = q.B; this.D = q.D; this.Tdes = q.T;
      this.xAft = -q.aftOver; this.xFwd = q.L + q.foreOver;
      this.LOA = this.xFwd - this.xAft;
      this.table = this._table();
    }

    // Fraction of the half-beam at the design waterline and at the deck.
    _wT(xi) {
      const q = this.p;
      if (xi < q.midAft) return 1 - (1 - q.transom) * Math.pow((q.midAft - xi) / q.midAft, 2.2);
      if (xi > q.midFwd) return Math.max(0, 1 - Math.pow((xi - q.midFwd) / (1 - q.midFwd), 1.9));
      return 1;
    }
    _wD(xi) {
      const q = this.p;
      if (xi < q.midAft) return 1 - 0.14 * Math.pow((q.midAft - xi) / q.midAft, 2);
      if (xi > q.midFwd) return Math.max(0.04, 1 - 0.96 * Math.pow((xi - q.midFwd) / (1.03 - q.midFwd), 2.4));
      return 1;
    }
    // Height of the hull bottom: the stern cuts up for the propeller, the
    // forefoot rounds up into the stem.
    _zb(xi) {
      const T = this.Tdes;
      if (xi < 0.09) return T * 0.62 * Math.pow((0.09 - xi) / 0.09, 1.6);
      if (xi > 0.965) return T * 0.55 * Math.pow((xi - 0.965) / 0.035, 1.5);
      return 0;
    }
    // Section fullness exponent: boxy amidships, V-shaped at the ends.
    _s(xi) {
      const q = this.p;
      let m;
      if (xi < q.sAft) m = Math.pow(xi / q.sAft, 2.2);
      else if (xi > q.sFwd) m = Math.pow((1 - xi) / (1 - q.sFwd), 1.8);
      else m = 1;
      return q.sEnd + (q.sMid - q.sEnd) * TL.clamp(m, 0, 1);
    }

    // Half-breadth (m) at x (from AP) and z (from keel). Zero outside the hull.
    halfBreadth(x, z) {
      const q = this.p;
      if (z < 0 || z > this.D + 1e-9) return 0;
      if (q.box) return x >= 0 && x <= q.L ? q.B / 2 : 0;
      if (x < this.xAft || x > this.xFwd) return 0;
      const xi = x / q.L;
      const zb = this._zb(xi);
      // Overhangs exist only above the waterline: the counter stern and the
      // flared bow rise out of the water.
      if (x < 0 || x > q.L) {
        const over = x < 0 ? -x / Math.max(q.aftOver, 1e-6) : (x - q.L) / Math.max(q.foreOver, 1e-6);
        const zMin = this.Tdes * (x < 0 ? 0.8 + 0.25 * over : 0.75 + 0.3 * over);
        if (z < zMin) return 0;
      }
      if (z < zb) return 0;
      const Tr = this.Tdes;
      const xiC = TL.clamp(xi, 0, 1);
      if (z <= Tr) {
        const zeta = (z - zb) / Math.max(Tr - zb, 1e-6);
        const g = 1 - Math.pow(1 - TL.clamp(zeta, 0, 1), this._s(xiC));
        return q.B / 2 * this._wT(xiC) * g;
      }
      const u = (z - Tr) / (this.D - Tr);
      const w = this._wT(xiC) + (this._wD(xiC) - this._wT(xiC)) * Math.sqrt(u);
      return q.B / 2 * w;
    }

    // Waterplane properties at height z.
    waterplane(z) {
      const n = 161, x0 = this.xAft, x1 = this.xFwd, h = (x1 - x0) / (n - 1);
      const ys = new Array(n), xy = new Array(n), x2y = new Array(n), y3 = new Array(n);
      for (let i = 0; i < n; i++) {
        const x = x0 + i * h, y = this.halfBreadth(x, z);
        ys[i] = y; xy[i] = x * y; x2y[i] = x * x * y; y3[i] = y * y * y;
      }
      const A = 2 * TL.simpson(ys, h);
      const Mx = 2 * TL.simpson(xy, h);
      const lcf = A > 1e-9 ? Mx / A : (x0 + x1) / 2;
      const IT = (2 / 3) * TL.simpson(y3, h);
      const IL = 2 * TL.simpson(x2y, h) - A * lcf * lcf;
      return { A, lcf, IT, IL, Mx };
    }

    _table() {
      const dz = 0.05, nz = Math.round(this.D / dz);
      const wps = [];
      for (let k = 0; k <= nz; k++) wps.push(this.waterplane(k * dz));
      const rows = [];
      let V = 0, Mz = 0, Mx = 0;
      for (let k = 1; k <= nz; k++) {
        const a = wps[k - 1], b = wps[k], za = (k - 1) * dz, zb = k * dz;
        // Trapezium between neighbouring waterplanes on a fine step.
        V += (a.A + b.A) * dz / 2;
        Mz += (a.A * za + b.A * zb) * dz / 2;
        Mx += (a.Mx + b.Mx) * dz / 2;
        if (k % 2 === 0 && zb >= 0.4) {
          const T = zb, wp = b;
          const KB = Mz / V, LCB = Mx / V;
          const BMT = wp.IT / V, BML = wp.IL / V;
          const disp = V * RHO;
          rows.push({
            T, vol: V, disp, KB, LCB, Aw: wp.A, LCF: wp.lcf, BMT, BML,
            KMT: KB + BMT, KML: KB + BML,
            TPC: wp.A * RHO / 100,
            // Moment to change trim one centimetre, from GML ~ BML.
            MCTC: disp * BML / (100 * this.L),
            IT: wp.IT,
          });
        }
      }
      return rows;
    }

    atDraft(T) {
      const r = {}, rows = this.table;
      for (const f of Object.keys(rows[0])) r[f] = TL.interp(rows, 'T', T, f);
      return r;
    }
    atDisp(disp) {
      const r = {}, rows = this.table;
      for (const f of Object.keys(rows[0])) r[f] = TL.interp(rows, 'disp', disp, f);
      return r;
    }
    get maxDisp() { return this.table[this.table.length - 1].disp; }

    // Block coefficient at a draft (on LBP, moulded).
    cb(T) { return this.atDraft(T).vol / (this.L * this.B * T); }
  }

  TL.RHO = RHO;
  TL.Hull = Hull;
})(globalThis.TL = globalThis.TL || {});
