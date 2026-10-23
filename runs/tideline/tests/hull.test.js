// The hydrostatics, checked against closed forms for a rectangular barge,
// where every quantity is known exactly (Barrass and Derrett, ch. 7, 13).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TL = require('../src/node.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('box barge: displacement, KB, BM, LCF and MCTC match the closed forms', () => {
  const L = 120, B = 20, D = 10;
  const hull = new TL.Hull({ L, B, D, T: 6, box: true });
  for (const T of [2, 4.5, 6, 8]) {
    const h = hull.atDraft(T);
    near(h.vol, L * B * T, L * B * T * 2e-3, `volume at ${T}`);
    near(h.KB, T / 2, 0.01, `KB at ${T}`);
    near(h.BMT, B * B / (12 * T), 0.01 * B * B / (12 * T), `BMT at ${T}`);
    near(h.BML, L * L / (12 * T), 0.01 * L * L / (12 * T), `BML at ${T}`);
    near(h.LCF, L / 2, 0.05, `LCF at ${T}`);
    near(h.LCB, L / 2, 0.05, `LCB at ${T}`);
    near(h.TPC, L * B * 1.025 / 100, 0.01, `TPC at ${T}`);
  }
});

test('box barge: a lateral weight shift lists the barge by atan(w d / (W GM))', () => {
  const L = 120, B = 20, D = 10, T = 5;
  const vessel = { hull: new TL.Hull({ L, B, D, T, box: true }) };
  const W = L * B * T * 1.025, KG = 4;
  const base = { W, Mx: W * L / 2, My: 0, Mz: W * KG, FSM: 0 };
  const c0 = TL.Stability.condition(vessel, base);
  const GM = T / 2 + B * B / (12 * T) - KG;
  near(c0.GM, GM, 0.02, 'GM');
  near(c0.heel, 0, 1e-9, 'upright');
  near(c0.trim, 0, 1e-6, 'even keel');
  // Move 200 t through 8 m to starboard.
  const c1 = TL.Stability.condition(vessel, Object.assign({}, base, { My: 200 * 8 }));
  near(c1.heel, Math.atan(200 * 8 / (W * GM)) * 180 / Math.PI, 0.02, 'list');
  // Move 300 t aft by 40 m: trim by the stern of w d / MCTC (cm).
  const c2 = TL.Stability.condition(vessel, Object.assign({}, base, { Mx: W * L / 2 - 300 * 40 }));
  const MCTC = W * (L * L / (12 * T)) / (100 * L);
  near(c2.trim, 300 * 40 / MCTC / 100, 0.005, 'trim');
  assert.ok(c2.Ta > c2.Tf, 'by the stern');
});

test('cross curves: KN at small angles agrees with KM sin(phi)', () => {
  const hull = new TL.Hull({ L: 120, B: 20, D: 10, T: 5, box: true });
  const cc = TL.Stability.crossCurves(hull);
  const W = 120 * 20 * 5 * 1.025;
  const kn = TL.Stability.knAt(cc, W);
  const KM = 5 / 2 + 400 / 60;
  const i = cc.angles.indexOf(5);
  near(kn[i] / Math.sin(5 * Math.PI / 180), KM, 0.1, 'KN(5)/sin 5');
  // The wall-sided formula is exact for a box until the deck edge immerses (26.6 deg here).
  const j = cc.angles.indexOf(20), phi = 20 * Math.PI / 180;
  const wall = Math.sin(phi) * (KM + 0.5 * (400 / 60) * Math.tan(phi) ** 2);
  near(kn[j], wall, 0.05, 'KN(20) against the wall-sided formula');
});

test('the generated hull has a plausible block coefficient', () => {
  const hull = new TL.Hull({ L: 248, B: 32.2, D: 19.3, T: 12.0, aftOver: 6, foreOver: 8 });
  const cb = hull.cb(12.0);
  assert.ok(cb > 0.6 && cb < 0.72, `Cb ${cb.toFixed(3)}`);
});
