// Stowage rules and the stability consequences of a re-plan.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TL = require('../src/node.js');
const S = TL.Stow;

function ship(seed = 3) {
  const v = new TL.Vessel('panamax', 'Test Ship', 'CVN');
  const rng = TL.rng(seed);
  S.generateArrival(v, rng, { discharge: 0.3 });
  const exports = [];
  for (let i = 0; i < 300; i++) exports.push(S.newBox(rng, { type: S.pickType(rng, rng() < 0.5, rng()), pod: 'CRN', line: 'CVN', w: S.weightFor(rng, rng() < 0.5, rng()) }));
  const plan = S.autoPlan(v, exports);
  return { v, plan, exports };
}

test('derived particulars are consistent with real ships of the class', () => {
  const v = new TL.Vessel('panamax', 'X', 'CVN');
  const p = v.particulars;
  assert.ok(p.LOA > 285 && p.LOA < 300, `LOA ${p.LOA}`);
  assert.ok(p.B <= 32.31, 'Panamax beam');
  assert.ok(p.teu > 3800 && p.teu < 4800, `TEU ${p.teu}`);
  assert.ok(p.dwt > 45000 && p.dwt < 65000, `DWT ${p.dwt}`);
});

test('the auto plan departs within limits, upright after anti-heel', () => {
  const { v, plan } = ship();
  const val = S.validatePlan(v, plan, { depth: 15 });
  assert.equal(val.ok, true, val.errs.join('; '));
  assert.ok(val.cond.GM > 0.5 && Math.abs(val.cond.heel) < 0.5);
});

test('re-plans that break a rule are refused with the rule named', () => {
  const { v, plan } = ship();
  const heavy = plan.stacks.flat().filter(b => b.w > 25)[0];
  // Top of the most forward deck stack: in front of the bridge, high up.
  const fwd = v.stacks.filter(s => s.deck).sort((a, b) => b.x - a.x)[0];
  let r = S.tryMove(v, plan, heavy, fwd.id, fwd.maxTiers - 1, { depth: 15 });
  assert.equal(r.ok, false);
  assert.ok(r.errs.some(e => /SOLAS|stack weight|holds/.test(e)), r.errs.join('; '));
  // A reefer into a hold (no sockets there).
  const rf = S.newBox(TL.rng(1), { type: 'RF', pod: 'CRN', line: 'CVN', w: 20 });
  const deck = v.stacks.find(s => s.deck && (plan.stacks[s.id] || []).length < 2);
  plan.stacks[deck.id].push(rf);
  const hold = v.stacks.find(s => !s.deck && !S.hatchBlocked(v, s.bay) && s.boxes.filter(S.isRob).length + (plan.stacks[s.id] || []).length < s.maxTiers);
  r = S.tryMove(v, plan, rf, hold.id, hold.boxes.filter(S.isRob).length, { depth: 15 });
  assert.equal(r.ok, false);
  assert.ok(r.errs.some(e => /reefer/.test(e)), r.errs.join('; '));
});

test('an accepted re-plan moves G by exactly the box’s moment', () => {
  const { v, plan } = ship();
  const before = S.departureCondition(v, plan);
  const box = plan.stacks.flat().find(b => b.w > 15 && b.w < 22);
  const from = plan.where(box), fs = v.stacks[from.stack];
  // Somewhere legal on the other side, low down if possible.
  const cands = v.stacks.filter(s => s.deck && Math.sign(s.y) !== Math.sign(fs.y) && Math.abs(s.y) > 3);
  let r = null, to = null;
  for (const st of cands) { const idx = st.boxes.filter(S.isRob).length; r = S.tryMove(v, plan, box, st.id, idx, { depth: 15 }); if (r.ok) { to = st; break; } }
  assert.ok(r && r.ok, 'found a legal move');
  const after = S.departureCondition(v, plan);
  // Before anti-heel: the transverse moment changes by w (y_to - y_from).
  const dMy = (after.TCG * after.W - after.antiHeel * (v.tanks.ahS.y - v.tanks.ahP.y)) - (before.TCG * before.W - before.antiHeel * (v.tanks.ahS.y - v.tanks.ahP.y));
  assert.ok(Math.abs(dMy - box.w * (to.y - fs.y)) < 1e-6 * Math.abs(box.w * to.y) + 1e-6, `dMy ${dMy} vs ${box.w * (to.y - fs.y)}`);
  assert.ok(Math.abs(after.W - before.W) < 1e-9, 'weight unchanged');
});
