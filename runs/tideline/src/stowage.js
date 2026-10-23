// stowage.js: containers, arrival conditions, the load plan and the rules a
// planned move must pass.
//
// A ship's cargo is a set of stacks, each a contiguous column of boxes from
// the tank top (hold) or the hatch cover (deck). Discharge takes boxes off
// the top; loading puts them on. The load plan is, per stack, the list of
// boxes to place above whatever remains on board (ROB).
'use strict';
(function (TL) {
  const PORT = 'ARD';                       // this terminal: Arden Bay
  const PODS = ['CRN', 'VLM', 'SLP', 'TSK'];
  const PORT_NAMES = { ARD: 'Arden Bay', CRN: 'Port Corrin', VLM: 'Velmont', SLP: 'Sallow Point', TSK: 'Taskerry' };
  // Fictional lines; the owner prefix of their container numbers (ISO 6346:
  // three letters and the category U) and the colour their boxes are painted.
  const LINES = {
    CVN: { name: 'Corvane Line', prefix: 'CVN', color: 0 },
    BRW: { name: 'Brindlewake Shipping', prefix: 'BRW', color: 2 },
    NMF: { name: 'Northmere Feeders', prefix: 'NMF', color: 3 },
    ALD: { name: 'Alder Ocean Lines', prefix: 'ALD', color: 1 },
    LSE: { name: 'Halden Leasing', prefix: 'HDL', color: 4 },
    LS2: { name: 'Grayle Container Leasing', prefix: 'GRY', color: 5 },
  };
  const TYPES = {
    DV: { label: "40' DV", h: TL.BOX.H, tare: 3.75 },
    HC: { label: "40' HC", h: TL.BOX.HC, tare: 3.95 },
    RF: { label: "40' Reefer", h: TL.BOX.HC, tare: 4.6 },
    MT: { label: 'Empty', h: TL.BOX.H, tare: 3.75 },
  };
  const MAX_GROSS = 30.48;

  let serial = 100000;
  function newBox(rng, opt) {
    const type = opt.type;
    const tare = TYPES[type].tare;
    let w = tare;
    if (type !== 'MT') w = TL.clamp(opt.w != null ? opt.w : tare + rng.normal(12, 6, 2, 26.5), tare + 1, MAX_GROSS);
    const lineKey = opt.line || 'CVN';
    const owner = LINES[lineKey].prefix + 'U';
    const num = String(serial++ % 1000000).padStart(6, '0');
    const id = owner + num + TL.isoCheckDigit(owner + num);
    return {
      id, type, h: TYPES[type].h, w: Math.round(w * 10) / 10, pod: opt.pod, line: lineKey,
      color: LINES[lineKey].color, reefer: type === 'RF', vessel: opt.vessel || null,
      loc: null,        // set by whoever holds it
    };
  }

  function pickLine(rng, home) {
    const r = rng();
    if (r < 0.5) return home;
    if (r < 0.7) return 'LSE';
    if (r < 0.8) return 'LS2';
    return rng.pick(['CVN', 'BRW', 'NMF', 'ALD']);
  }
  function pickType(rng, deck, tierFrac) {
    const r = rng();
    if (deck && tierFrac > 0.6 && r < 0.45) return 'MT';
    if (deck && r < 0.10) return 'RF';
    if (r < 0.55) return 'HC';
    if (r < 0.92) return 'DV';
    return 'MT';
  }

  // Weight for a box at a given height fraction of its stack: heavy low,
  // light high, the way planners build stable stacks.
  function weightFor(rng, deck, tierFrac) {
    const mean = deck ? 19 - 9 * tierFrac : 25 - 6 * tierFrac;
    return rng.normal(mean, 4.5, 6, 29.5);
  }

  // Arrival condition: fills the ship's stacks, marks the boxes for this port
  // so that they always sit on top (no restows), then trims ballast for a
  // healthy GM and a little trim by the stern.
  function generateArrival(vessel, rng, cfg = {}) {
    const fill = cfg.fill != null ? cfg.fill : 0.78;
    const dischargeShare = cfg.discharge != null ? cfg.discharge : 0.4;
    const home = vessel.line;
    const hatchWork = new Set();
    vessel.bays.forEach((b, i) => { if (rng() < 0.55) hatchWork.add(i); });
    for (const st of vessel.stacks) {
      st.boxes = [];
      const bayWork = hatchWork.has(st.bay);
      let n = Math.round(st.maxTiers * TL.clamp(fill + rng.normal(0, 0.18), 0.2, 1));
      if (!st.deck && st.maxTiers <= 2) n = Math.min(n, st.maxTiers);
      // How many boxes on top are for this port.
      let k;
      if (st.deck) k = bayWork ? n : Math.round(n * TL.clamp(dischargeShare + rng.normal(0, 0.25), 0, 1));
      else k = bayWork ? Math.round(n * TL.clamp(dischargeShare * 1.4 + rng.normal(0, 0.3), 0, 1)) : 0;
      const laterPod = rng.pick(PODS.slice(0, 3));
      for (let t = 0; t < n; t++) {
        const frac = n > 1 ? t / (st.maxTiers - 1 || 1) : 0;
        let type = pickType(rng, st.deck, frac);
        if (type === 'RF' && !st.reefer) type = 'HC';
        const pod = t >= n - k ? PORT : (rng() < 0.75 ? laterPod : rng.pick(PODS));
        const box = newBox(rng, { type, pod, line: pickLine(rng, home), w: weightFor(rng, st.deck, frac), vessel: vessel.name });
        st.boxes.push(box);
      }
      // A hold stack may not be taller than the hold.
      if (!st.deck) while (vessel.stackHeight(st, st.boxes) > st.top - st.base) st.boxes.pop();
      for (let i = 0; i < st.boxes.length; i++) st.boxes[i].loc = { kind: 'ship', vessel: vessel.name, stack: st.id, idx: i };
    }
    vessel.hatchWork = hatchWork;
    trimBallast(vessel, cfg.gm || 1.4, cfg.trim != null ? cfg.trim : 0.6);
    // Deck stacks forward of the bridge must leave the sea in view (SOLAS
    // V/22) at the arrival drafts; take boxes off the top until they do.
    for (let pass = 0; pass < 2; pass++) {
      const c = conditionOf(vessel);
      for (const st of vessel.stacks) {
        if (!st.deck) continue;
        while (st.boxes.length && st.base + vessel.stackHeight(st, st.boxes) > vessel.visibilityTop(st.x, c.Ta, c.Tf)) st.boxes.pop();
      }
      trimBallast(vessel, cfg.gm || 1.4, cfg.trim != null ? cfg.trim : 0.6);
    }
  }

  // Set double-bottom ballast for a target GM and the peak tanks for a
  // target trim (by the stern, metres), by a few fixed-point passes.
  function trimBallast(vessel, gmTarget, trimTarget) {
    const T = vessel.tanks;
    if (!T.fpk) {
      const L = vessel.hull.L, cap = Math.round(vessel.dispDesign * 0.025);
      T.fpk = { cap, fill: 0.3, x: 0.965 * L, y: 0, z: vessel.c.D * 0.35, fsm: 0 };
      T.apk = { cap, fill: 0.3, x: 0.035 * L, y: 0, z: vessel.c.D * 0.55, fsm: 0 };
    }
    for (let it = 0; it < 30; it++) {
      const c = conditionOf(vessel);
      // More ballast low raises GM (lowers KG) until the tank is full.
      T.ballast.fill = TL.clamp(T.ballast.fill + (gmTarget - c.GM) * 0.08, 0, 1);
      const err = trimTarget - c.trim;
      T.apk.fill = TL.clamp(T.apk.fill + err * 0.08, 0, 1);
      T.fpk.fill = TL.clamp(T.fpk.fill - err * 0.08, 0, 1);
    }
    // Pressed or empty, never slack (no free surface from peaks / DB).
    for (const k of ['fpk', 'apk', 'ballast']) T[k].fill = Math.round(T[k].fill * 50) / 50;
    levelAntiHeel(vessel, 1);
  }

  // The anti-heeling system: move water between the wing tanks to bring the
  // list toward zero, at most maxT tonnes (Infinity: as far as capacity allows).
  // Returns the tonnes moved (positive: port to starboard).
  function levelAntiHeel(vessel, frac = 1, maxT = Infinity) {
    const T = vessel.tanks, P = T.ahP, S = T.ahS;
    const c = conditionOf(vessel);
    const My = c.TCG * c.W;
    const arm = S.y - P.y;
    let m = -My / arm * frac;
    m = TL.clamp(m, -S.cap * S.fill, P.cap * P.fill);
    m = TL.clamp(m, -maxT, maxT);
    P.fill -= m / P.cap; S.fill += m / S.cap;
    return m;
  }

  // Condition from the ship's physical stacks (what is on board now).
  function conditionOf(vessel, extra) {
    const f = vessel.fixedSums();
    const c = vessel.cargoSums(vessel.stacks.map(s => s.boxes));
    const s = { W: f.W + c.W, Mx: f.Mx + c.Mx, My: f.My + c.My, Mz: f.Mz + c.Mz, FSM: f.FSM };
    if (extra) for (const e of extra) { s.W += e.w; s.Mx += e.w * e.x; s.My += e.w * e.y; s.Mz += e.w * e.z; }
    return TL.Stability.condition(vessel, s);
  }

  // Final stacks under a plan: what remains on board after discharge, plus
  // the planned loads.
  function finalStacks(vessel, plan) {
    return vessel.stacks.map((st, i) => {
      const rob = st.boxes.filter(b => b.pod !== PORT);
      return rob.concat(plan.stacks[i] || []);
    });
  }
  // Departure condition under a plan, after the anti-heeling system has
  // levelled the ship as far as its tanks allow (what a loading computer
  // reports for sailing).
  function departureCondition(vessel, plan) {
    const f = vessel.fixedSums();
    const c = vessel.cargoSums(finalStacks(vessel, plan));
    const s = { W: f.W + c.W, Mx: f.Mx + c.Mx, My: f.My + c.My, Mz: f.Mz + c.Mz, FSM: f.FSM };
    const P = vessel.tanks.ahP, S = vessel.tanks.ahS;
    const m = TL.clamp(-s.My / (S.y - P.y), -S.cap * S.fill, P.cap * P.fill);
    s.My += m * (S.y - P.y);
    const cond = TL.Stability.condition(vessel, s);
    cond.antiHeel = m;
    cond.antiHeelSpare = Math.min(P.cap * P.fill - m, S.cap * S.fill + m);
    return cond;
  }

  // Does the bay's deck still carry boxes that stay on board? Then its hatch
  // covers cannot be lifted, and the hold below is closed to this call.
  function hatchBlocked(vessel, bayIdx) {
    for (const id of vessel.bays[bayIdx].stacks) {
      const st = vessel.stacks[id];
      if (st.deck && st.boxes.some(b => b.pod !== PORT)) return true;
    }
    return false;
  }

  // Check one final stack against the physical rules. Returns a list of
  // reasons it is illegal (empty if fine) and warnings.
  function checkStack(vessel, st, list, cond) {
    const errs = [], warns = [];
    if (list.length > st.maxTiers) errs.push(`stack ${vessel.brt(st.id, 0).slice(0, 5)} holds ${st.maxTiers} tiers`);
    const h = vessel.stackHeight(st, list);
    if (!st.deck && h > st.top - st.base + 1e-6) errs.push('stack would be taller than the hold under the hatch cover');
    const w = list.reduce((a, b) => a + b.w, 0);
    if (w > st.maxW) errs.push(`stack weight ${w.toFixed(1)} t exceeds ${st.maxW} t`);
    list.forEach((b, i) => {
      if (b.reefer && !st.reefer) errs.push('reefers need a deck slot with a power socket');
      if (i > 0 && b.w > list[i - 1].w + 6) warns.push('heavy box above a light one');
    });
    if (st.deck && cond) {
      const top = st.base + h;
      const lim = vessel.visibilityTop(st.x, cond.Ta, cond.Tf);
      if (top > lim + 1e-6) errs.push(`blocks the bridge's view of the sea (SOLAS V/22): ${top.toFixed(1)} m above keel, limit ${lim.toFixed(1)} m`);
    }
    return { errs, warns };
  }

  // Validate the whole plan (all stacks, plus departure stability).
  function validatePlan(vessel, plan, opts = {}) {
    const fin = finalStacks(vessel, plan);
    const cond = departureCondition(vessel, plan);
    const errs = [], warns = [];
    vessel.stacks.forEach((st, i) => {
      const r = checkStack(vessel, st, fin[i], cond);
      errs.push(...r.errs); warns.push(...r.warns);
      if (!st.deck && (plan.stacks[i] || []).length && hatchBlocked(vessel, st.bay)) errs.push(`hold of bay ${String(vessel.bays[st.bay].no).padStart(2, '0')} is closed: deck cargo for later ports sits on its hatch covers`);
    });
    const a = TL.Stability.assess(cond, { departure: true, depth: opts.depth });
    errs.push(...a.out);
    warns.push(...a.near);
    return { ok: errs.length === 0, errs, warns, cond, assess: a };
  }

  // Try moving a planned box to (stack, position). Returns the verdict and,
  // if accepted, applies it.
  function tryMove(vessel, plan, box, toStack, toIdx, opts = {}) {
    const from = plan.where(box);
    if (!from) return { ok: false, errs: ['only boxes still waiting in the yard can be re-planned'] };
    const st = vessel.stacks[toStack];
    if (!st) return { ok: false, errs: ['no such slot'] };
    const rob = st.boxes.filter(b => b.pod !== PORT).length;
    const snapshot = plan.stacks.map(s => (s ? s.slice() : []));
    // Remove, then insert at the requested position (contiguous, no gaps).
    plan.stacks[from.stack].splice(from.idx, 1);
    const target = plan.stacks[toStack] || (plan.stacks[toStack] = []);
    const k = TL.clamp(toIdx - rob, 0, target.length);
    if (toIdx - rob < 0) { plan.stacks = snapshot; return { ok: false, errs: ['that slot holds a box that stays on board'] }; }
    target.splice(k, 0, box);
    const v = validatePlan(vessel, plan, opts);
    // Only errors this move introduced count: compare with the plan before.
    const before = validatePlan(vessel, { stacks: snapshot, where: plan.where }, opts);
    const fresh = v.errs.filter(e => !before.errs.includes(e));
    if (fresh.length) { plan.stacks = snapshot; return { ok: false, errs: fresh, cond: v.cond }; }
    return { ok: true, warns: v.warns, cond: v.cond, snapped: k !== toIdx - rob };
  }

  // Build a load plan for a set of export boxes: heaviest first into the
  // lowest free positions, alternating port and starboard, hold before deck,
  // checking each stack's rules as it goes and the stability at the end.
  function autoPlan(vessel, exports, opts = {}) {
    const plan = makePlan(vessel);
    const rob = vessel.stacks.map(st => st.boxes.filter(b => b.pod !== PORT));
    const order = exports.slice().sort((a, b) => b.w - a.w);
    // Candidate stacks: holds of open bays, then decks, ordered to spread
    // weight evenly fore and aft and across.
    const cands = vessel.stacks.filter(st => st.deck || !hatchBlocked(vessel, st.bay));
    const arr = conditionOf(vessel);
    let My = arr.TCG * arr.W;
    const estCond = { Ta: arr.Ta, Tf: arr.Tf };
    const len = (st) => rob[st.id].length + plan.stacks[st.id].length;
    for (const box of order) {
      let best = null, bestScore = Infinity;
      for (const st of cands) {
        if (box.reefer && !st.reefer) continue;
        const list = rob[st.id].concat(plan.stacks[st.id], [box]);
        if (list.length > st.maxTiers) continue;
        if (checkStack(vessel, st, list, estCond).errs.length) continue;
        // Prefer low positions for heavy boxes, the requested side, midships.
        const z = st.base + vessel.stackHeight(st, list) - box.h;
        // Balance: prefer the side that brings the running moment back to zero.
        const side = My > 0 ? -1 : 1;
        const sideOk = Math.sign(st.y) === side || Math.abs(st.y) < 0.1 ? 0 : 1;
        const lx = Math.abs(st.x - vessel.hull.L * 0.5) / vessel.hull.L;
        const score = z * (box.w / 10) + sideOk * 6 + lx * 8 + len(st) * 0.2 + (st.deck ? 0 : -2);
        if (score < bestScore) { bestScore = score; best = st; }
      }
      if (!best) continue;              // shut out: stays in the yard for the next call
      plan.stacks[best.id].push(box);
      My += box.w * best.y;
    }
    return plan;
  }

  function makePlan(vessel) {
    const plan = {
      stacks: vessel.stacks.map(() => []),
      where(box) {
        for (let i = 0; i < this.stacks.length; i++) {
          const k = this.stacks[i].indexOf(box);
          if (k >= 0) return { stack: i, idx: k };
        }
        return null;
      },
      count() { return this.stacks.reduce((n, s) => n + s.length, 0); },
    };
    return plan;
  }

  TL.Stow = {
    PORT, PODS, PORT_NAMES, LINES, TYPES, MAX_GROSS,
    newBox, generateArrival, trimBallast, levelAntiHeel, conditionOf, finalStacks, departureCondition,
    hatchBlocked, checkStack, validatePlan, tryMove, autoPlan, makePlan, weightFor, pickType, pickLine,
  };
})(globalThis.TL = globalThis.TL || {});
