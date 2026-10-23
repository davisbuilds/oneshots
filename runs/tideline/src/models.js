// models.js: what each thing looks like, built from boxes in its own frame,
// and the per-frame fill of the instancers from the simulation state.
'use strict';
(function (TL) {
  const { F } = TL.GL;
  const L = TL.Layout, CR = TL.Crane, M = TL.MAPF;
  const PAL = TL.PAL, BOXCOL = TL.BOXCOL;
  const Sim = TL.Sim;

  // A tiny builder: a frame stack over the instancers.
  class Builder {
    constructor(r) { this.r = r; this.stack = [F.id()]; this.target = { box: r.box, cyl: r.cyl, ball: r.ball, prism: r.prism }; }
    static(on) { const r = this.r; this.target = on ? { box: r.sBox, cyl: r.sCyl, ball: r.sBall, prism: r.sPrism } : { box: r.box, cyl: r.cyl, ball: r.ball, prism: r.prism }; }
    get top() { return this.stack[this.stack.length - 1]; }
    push(m) { this.stack.push(F.mul(this.top, m)); return this; }
    pop() { this.stack.pop(); return this; }
    set(m) { this.stack.push(m); return this; }
    // Box centred at (x, y, z) with size (sx, sy, sz) in the current frame.
    box(x, y, z, sx, sy, sz, col, mat, kind) {
      const m = F.mul(this.top, [sx, 0, 0, x, 0, sy, 0, y, 0, 0, sz, z]);
      this.target[kind || 'box'].push(m, col[0], col[1], col[2], mat || 0);
    }
    cyl(x, y, z, r, h, col, mat) { this.box(x, y, z, 2 * r, 2 * r, h, col, mat, 'cyl'); }
    ball(x, y, z, r, col, mat, sz) { this.box(x, y, z, 2 * r, 2 * r, 2 * r * (sz || 1), col, mat, 'ball'); }
    // A beam between two points (square section).
    beam(a, b, w, col, mat) {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
      const ux = [dx / len, dy / len, dz / len];
      let vx = Math.abs(ux[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      let wv = [ux[1] * vx[2] - ux[2] * vx[1], ux[2] * vx[0] - ux[0] * vx[2], ux[0] * vx[1] - ux[1] * vx[0]];
      const lw = Math.hypot(...wv); wv = wv.map(q => q / lw);
      const v = [wv[1] * ux[2] - wv[2] * ux[1], wv[2] * ux[0] - wv[0] * ux[2], wv[0] * ux[1] - wv[1] * ux[0]];
      const m = [ux[0] * len, wv[0] * w, v[0] * w, (a[0] + b[0]) / 2, ux[1] * len, wv[1] * w, v[1] * w, (a[1] + b[1]) / 2, ux[2] * len, wv[2] * w, v[2] * w, (a[2] + b[2]) / 2];
      this.target.box.push(F.mul(this.top, m), col[0], col[1], col[2], mat || 0);
    }
  }

  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  // ── Ship-to-shore crane, in its own frame (origin on the quay edge) ────
  function crane(b, c, trolleyY, spreaderZ, box, hi) {
    const leg = PAL.navy, boom = PAL.mustard, dark = PAL.ink;
    const W = 9.2, yW = L.RAIL.water, yL = L.RAIL.land, top = 44;
    // Bogies and legs.
    for (const y of [yW, yL]) for (const x of [-W, W]) {
      b.box(x, y, 0.9, 8, 2.6, 1.8, dark, 0);
      for (const dx of [-2.8, -0.9, 0.9, 2.8]) b.cyl(x + dx, y, 0.55, 0.55, 2.8, PAL.rubber);
      b.box(x, y, (top + 2) / 2, 2.9, 2.9, top - 2, leg, 0);
    }
    // Portal beams (across the lanes, high enough for straddle carriers) and sill ties.
    for (const x of [-W, W]) {
      b.box(x, (yW + yL) / 2, 21, 2.4, yL - yW, 2.8, leg, 3);
      b.box(x, (yW + yL) / 2 - 7, top - 1, 2.6, yL - yW + 24, 3.6, leg, 3);
    }
    b.box(0, yW, top - 3, 2 * W + 2.2, 2.2, 2.4, leg, 0);
    b.box(0, yL, top - 3, 2 * W + 2.2, 2.2, 2.4, leg, 0);
    b.box(0, yL + 13, top - 1, 2 * W + 2.2, 2.0, 2.4, leg, 0);
    // A-frame and stays.
    const apex = [0, yW + 9, 74];
    for (const x of [-W, W]) {
      b.beam([x * 0.95, yW + 1, top], [x * 0.35, apex[1], apex[2]], 2.1, leg);
      b.beam([x * 0.95, yL - 6, top], [x * 0.35, apex[1], apex[2]], 2.1, leg);
    }
    b.box(0, apex[1], apex[2], 2 * W * 0.35 + 1.6, 2.2, 2.2, leg);
    // Boom: two girders out over the water, raised when idle (hi = 0..1).
    const outreach = 52;
    b.push(F.mul(F.T(0, yW + 2, top + 1.5), F.Rx(-(hi || 0) * 1.25)));
    for (const x of [-4.2, 4.2]) b.box(x, -outreach / 2, 0, 2.2, outreach + 2, 3.8, boom, 3);
    for (let k = 0; k <= 6; k++) b.box(0, -k * outreach / 6, 1.2, 8.4, 0.9, 0.6, boom, 0);
    b.box(0, -outreach, 0.4, 9.6, 1.5, 3.6, boom, 0);
    b.pop();
    for (const x of [-4.2, 4.2]) b.box(x, yL - 2, top + 1.5, 2.2, yL - yW + 22, 3.8, boom, 3);
    for (const x of [-4.2, 4.2]) {
      b.beam([x * 0.6, apex[1], apex[2]], [x, yW - outreach * 0.55, top + 3.2], 0.7, leg);
      b.beam([x * 0.6, apex[1], apex[2]], [x, yW - outreach + 2, top + 3.2], 0.7, leg);
      b.beam([x * 0.6, apex[1], apex[2]], [x, yL + 14, top + 3.2], 0.8, leg);
    }
    // Machinery house on the backreach.
    b.box(0, yL + 9, top + 5.8, 13, 13, 7.2, PAL.white, 2);
    b.box(0, yL + 9, top + 9.7, 13.6, 13.6, 0.6, shade(PAL.white, 0.9), 0);
    // Trolley, cab, ropes, spreader and the box it holds.
    const ty = trolleyY;
    b.box(0, ty, top + 1.2, 9.0, 7.0, 2.6, PAL.white, 0);
    b.box(-2.6, ty - 1.5, top - 2.4, 2.6, 2.8, 2.6, PAL.white, 5);
    const sz = Math.max(1.2, spreaderZ);
    for (const dx of [-3.6, 3.6]) for (const dy of [-0.7, 0.7]) b.beam([dx, ty + dy, top - 0.2], [dx * 1.3, ty + dy * 0.8, sz + 0.75], 0.12, dark);
    b.box(0, ty, sz + 0.35, 12.4, 2.5, 0.7, PAL.mustard, 0);
    b.box(-5.6, ty, sz + 0.35, 1.2, 2.8, 0.9, dark, 0); b.box(5.6, ty, sz + 0.35, 1.2, 2.8, 0.9, dark, 0);
    if (box) boxAt(b, 0, ty, sz - box.h / 2, 0, box);
  }

  // A container centred at (x, y, z) in the current frame, long axis at yaw.
  function boxAt(b, x, y, z, yaw, box) {
    const col = BOXCOL[box.color] || BOXCOL[0];
    const k = box.type === 'MT' ? 0.92 : 1;
    const c = box.reefer ? PAL.cream : [col[0] * k, col[1] * k, col[2] * k];
    const Lb = TL.BOX.L, Wb = TL.BOX.W, H = box.h;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    b.target.box.push(F.mul(b.top, [cs * Lb, -sn * Wb, 0, x, sn * Lb, cs * Wb, 0, y, 0, 0, H, z]), c[0], c[1], c[2], 1);
    if (box.reefer) {
      // Machinery end in navy.
      const ex = x - cs * (Lb / 2 - 0.25), ey = y - sn * (Lb / 2 - 0.25);
      b.target.box.push(F.mul(b.top, [cs * 0.55, -sn * (Wb + 0.02), 0, ex, sn * 0.55, cs * (Wb + 0.02), 0, ey, 0, 0, H + 0.02, z]), PAL.navy[0], PAL.navy[1], PAL.navy[2], 0);
    }
  }

  // ── Straddle carrier (frame: centre on the ground, x along travel) ─────
  function straddle(b, spreaderZ, box, num) {
    const frame = PAL.mustard, dark = PAL.ink;
    for (const y of [-2.2, 2.2]) {
      b.box(0, y, 0.95, 9.6, 0.9, 0.9, dark, 0);
      for (const x of [-3.9, -1.3, 1.3, 3.9]) b.box(x, y, 0.6, 1.0, 0.7, 1.2, PAL.rubber, 0);
      for (const x of [-4.1, 4.1]) b.box(x, y, 7.6, 0.9, 0.9, 13.4, frame, 0);
      b.box(0, y, 14.3, 10.0, 1.0, 1.4, frame, 0);
    }
    for (const x of [-4.1, 4.1]) b.box(x, 0, 14.3, 1.0, 5.4, 1.2, frame, 0);
    b.box(0, 0, 15.3, 5.0, 3.0, 1.4, shade(frame, 0.92), 0);
    b.box(3.4, 2.2, 13.0, 2.0, 1.8, 2.6, PAL.white, 5);
    // Spreader on its ropes.
    const sz = spreaderZ;
    for (const x of [-3.5, 3.5]) b.beam([x, 0, 14.0], [x, 0, sz + 0.5], 0.1, dark);
    b.box(0, 0, sz + 0.3, 11.6, 2.3, 0.5, dark, 0);
    if (box) boxAt(b, 0, 0, sz - box.h / 2, 0, box);
  }

  // ── Truck: tractor and 40 ft trailer (frame: centre, x forward) ───────
  function truck(b, cabCol, box) {
    const dark = PAL.ink;
    b.box(6.0, 0, 1.0, 4.0, 2.5, 0.6, dark, 0);
    b.box(6.6, 0, 2.6, 2.4, 2.5, 2.8, cabCol, 5);
    b.box(7.85, 0, 2.0, 0.15, 2.3, 1.2, shade(cabCol, 0.7), 0);
    b.box(-2.5, 0, 1.15, 12.4, 2.4, 0.35, dark, 0);
    for (const x of [-7.2, -6.0, 5.0, 7.0]) for (const y of [-1.0, 1.0]) b.box(x, y, 0.5, 1.0, 0.5, 1.0, PAL.rubber, 0);
    if (box) boxAt(b, -2.5, 0, 1.35 + box.h / 2, 0, box);
  }

  // ── Static scenery ─────────────────────────────────────────────────────
  function scenery(b) {
    b.static(true);
    const sc = L.scenery();
    // Quay wall, fenders, bollards.
    b.box(400, -0.6, -2.0, 1000, 1.2, 4.0, PAL.concrete, 0);
    for (let x = -80; x < 900; x += 14) { b.box(x, -1.35, -1.7, 1.6, 0.6, 2.6, PAL.rubber, 0); }
    for (let x = -73; x < 900; x += 14) { b.cyl(x, 1.1, 0.45, 0.45, 0.9, PAL.mustard); b.cyl(x, 1.1, 0.95, 0.6, 0.15, PAL.mustard); }
    // Rails as low steel strips (the ground paints the rest).
    for (const y of [L.RAIL.water, L.RAIL.land]) b.box(400, y, 0.06, 1000, 0.5, 0.12, PAL.steel, 0);
    // Light masts with lamp heads.
    for (const m of sc.masts) {
      b.cyl(m.x, m.y, m.h / 2, 0.45, m.h, PAL.steel);
      b.box(m.x, m.y, m.h + 0.5, 3.4, 3.4, 0.9, PAL.ink, 0);
      b.box(m.x, m.y, m.h - 0.1, 3.0, 3.0, 0.3, [1.0, 0.95, 0.78], 8);
    }
    // Buildings.
    for (const B of sc.buildings) {
      const col = B.kind === 'office' ? PAL.white : B.kind === 'shed' ? hexA('#d9c9ad') : B.kind === 'gatehouse' ? PAL.white : hexA('#cdbfa7');
      b.box(B.x, B.y, B.h / 2, B.w, B.d, B.h, col, 2);
      b.box(B.x, B.y, B.h + 0.3, B.w + 0.8, B.d + 0.8, 0.6, B.kind === 'office' ? PAL.terracotta : PAL.slate, 0);
      if (B.kind === 'shed') { b.push(F.T(B.x, B.y, B.h + 0.6)); b.box(0, 0, 2.2, B.w, B.d, 4.4, PAL.slate, 0, 'prism'); b.pop(); }
    }
    // Gate canopy over the lanes.
    const gx = L.GATE.x;
    b.box(gx, 409, 9.2, 22, 34, 1.0, PAL.white, 0);
    b.box(gx, 409, 9.9, 22, 34, 0.4, PAL.terracotta, 0);
    for (const y of [394.5, 409.5, 423.5]) for (const dx of [-9, 9]) b.box(gx + dx, y, 4.5, 0.8, 0.8, 9, PAL.steel, 0);
    for (const y of [403.0, 416.0]) { b.box(gx, y, 1.6, 4.0, 2.2, 3.2, PAL.white, 2); b.box(gx, y, 3.3, 4.6, 2.6, 0.3, PAL.ink, 0); }
    // Reefer racks in block D2.
    const D2 = L.BLOCKS.find(B => B.reefer);
    for (let i = D2.i0; i <= D2.i1 + 1; i += 2) {
      const x = i * L.CELL;
      b.box(x, (D2.y0 + D2.y1) / 2, 9.5, 0.4, D2.y1 - D2.y0, 0.4, PAL.steel, 0);
      for (let y = D2.y0; y <= D2.y1; y += 26) b.box(x, y, 4.75, 0.35, 0.35, 9.5, PAL.steel, 0);
    }
    // Fence and trees.
    b.box(487, 455, 1.0, 975, 0.15, 2.0, hexA('#b9b4a8'), 0);
    b.box(975, 227, 1.0, 0.15, 455, 2.0, hexA('#b9b4a8'), 0);
    for (const t of sc.trees) {
      b.cyl(t.x, t.y, t.r * 0.45, t.r * 0.18, t.r * 0.9, PAL.trunk);
      b.ball(t.x, t.y, t.r * 1.45, t.r, (t.x * 7 + t.y) % 3 < 1.5 ? PAL.tree : PAL.tree2, 6, 1.15);
    }
    // A breakwater with a little lighthouse, to close the harbour.
    b.box(-140, -330, -1.5, 420, 14, 5, PAL.concrete, 0);
    for (let x = -340; x < 60; x += 9) b.box(x, -322 + Math.sin(x) * 1.5, -0.8, 8, 4, 3.2, shade(PAL.concrete, 0.92), 0);
    b.cyl(60, -330, 6, 2.4, 14, PAL.white);
    b.cyl(60, -330, 3.5, 2.5, 2.2, PAL.terracotta);
    b.cyl(60, -330, 10.5, 2.5, 2.2, PAL.terracotta);
    b.cyl(60, -330, 13.8, 1.6, 2.2, [1, 0.94, 0.75], 8);
    b.static(false);
  }
  function hexA(h) { return TL.GL.hex(h); }

  // ── Ship superstructure and cargo, in ship coordinates ────────────────
  function shipTop(b, call, sim, pal) {
    const v = call.vessel, c = v.c, h = v.hull, D = h.D;
    const deckTop = D + TL.VESSEL.COAMING + TL.VESSEL.HATCH;
    // Hatch covers and coamings over each bay.
    for (const bay of v.bays) {
      const holdRows = bay.stacks.map(id => v.stacks[id]).filter(s => !s.deck);
      const deckRows = bay.stacks.map(id => v.stacks[id]).filter(s => s.deck);
      const w = holdRows.length ? (holdRows.length * TL.VESSEL.ROW_PITCH + 1.0) : (deckRows.length * TL.VESSEL.ROW_PITCH * 0.6);
      b.box(bay.x, 0, D + TL.VESSEL.COAMING / 2, 12.6, w + 0.6, TL.VESSEL.COAMING, shade(PAL.deck, 0.92), 0);
      b.box(bay.x, 0, D + TL.VESSEL.COAMING + TL.VESSEL.HATCH / 2, 12.9, w + 0.4, TL.VESSEL.HATCH, pal.hatch, 7);
      // Lashing bridge on the aft side of the bay.
      b.box(bay.x - 6.5, 0, deckTop + 1.2, 0.7, Math.min(h.B - 1.5, w + 4), 2.4, shade(PAL.navy, 1.1), 0);
    }
    // Accommodation, bridge, funnel.
    const ax = (v.accom.x0 + v.accom.x1) / 2, al = v.accom.x1 - v.accom.x0;
    const decks = Math.max(4, Math.round((v.c.eye - 2 - D) / 2.8));
    const hb = h.B - 6;
    b.box(ax, 0, D + decks * 2.8 / 2, al - 1, hb * 0.62, decks * 2.8, PAL.white, 2);
    b.box(ax + al * 0.12, 0, D + decks * 2.8 + 1.4, al * 0.55, h.B + 0.6, 2.8, PAL.white, 2);
    b.box(ax + al * 0.12, 0, D + decks * 2.8 + 2.95, al * 0.6, h.B + 1, 0.3, PAL.navy, 0);
    b.box(ax + al * 0.12 + al * 0.28, 0, D + decks * 2.8 + 1.4, 0.3, h.B + 0.62, 1.1, PAL.glass, 0);
    const fx = c.accomBays ? v.accom.x0 + 2.2 : ax - al * 0.25;
    b.box(fx, 0, D + decks * 2.8 + 3.5, 4.2, 6.2, 7.0, PAL.white, 0);
    b.box(fx, 0, D + decks * 2.8 + 5.2, 4.3, 6.3, 1.6, pal.funnel, 0);
    b.box(fx, 0, D + decks * 2.8 + 7.2, 4.4, 6.4, 0.6, PAL.ink, 0);
    b.box(ax + al * 0.1, 0, D + decks * 2.8 + 6, 0.5, 0.5, 6, PAL.white, 0);
    // Forecastle and bow mast.
    const xf = h.L - 8;
    b.box(xf + 3, 0, D + 1.2, 12, h.halfBreadth(xf, D) * 1.6, 2.4, PAL.deck, 0);
    b.box(xf + 6, 0, D + 7, 0.6, 0.6, 12, PAL.white, 0);
    b.box(xf + 6, 0, D + 12, 0.6, 4.0, 0.4, PAL.white, 0);
    // Stern deck house for steering gear.
    b.box(h.xAft + 6, 0, D + 1.4, 7, h.B * 0.5, 2.8, PAL.white, 2);
    // Cargo.
    for (const st of v.stacks) {
      if (!st.boxes.length) continue;
      let z = st.base;
      // Hold stacks show only what pokes above the coaming (the rest is
      // hidden under the hatch covers when they are on).
      for (let k = 0; k < st.boxes.length; k++) {
        const bx = st.boxes[k];
        if (st.deck || z + bx.h > D + TL.VESSEL.COAMING - 0.2 || !holdCovered(v, st.bay)) boxAt(b, st.x, st.y, z + bx.h / 2, 0, bx);
        z += bx.h;
      }
    }
  }
  // Is the hatch of a bay closed (deck cargo or covers in place)? A hold is
  // open while the crane is working it.
  function holdCovered(v, bayIdx) { return !(v._open && v._open.has(bayIdx)); }

  // ── Fill everything for a frame ────────────────────────────────────────
  const tmp = { x: 0, y: 0, th: 0, k: 0 };
  const LINE_PAL = {
    CVN: { funnel: TL.GL.hex('#c65a3e'), hatch: TL.GL.hex('#6f7f86') },
    BRW: { funnel: TL.GL.hex('#4b8f98'), hatch: TL.GL.hex('#7c8a7f') },
    NMF: { funnel: TL.GL.hex('#5d84a3'), hatch: TL.GL.hex('#77808c') },
    ALD: { funnel: TL.GL.hex('#e2a93f'), hatch: TL.GL.hex('#7d8580') },
  };
  function shipMatrix(sim, call) {
    const p = sim.shipPose(call);
    const o = Sim.shipToWorld(p, 0, 0, 0, {}), ex = Sim.shipToWorld(p, 1, 0, 0, {}), ey = Sim.shipToWorld(p, 0, 1, 0, {}), ez = Sim.shipToWorld(p, 0, 0, 1, {});
    const fr = [ex.x - o.x, ey.x - o.x, ez.x - o.x, o.x, ex.y - o.y, ey.y - o.y, ez.y - o.y, o.y, ex.z - o.z, ey.z - o.z, ez.z - o.z, o.z];
    const m4 = new Float32Array([fr[0], fr[4], fr[8], 0, fr[1], fr[5], fr[9], 0, fr[2], fr[6], fr[10], 0, fr[3], fr[7], fr[11], 1]);
    return { frame: fr, m4, pose: p };
  }

  // Spreader height of a straddle carrier through a task.
  function scSpreader(sim, sc, t) {
    const travel = 10.2;
    const task = sc.task;
    if (!task) return travel;
    const low = (z0, a, b2) => { if (t <= a) return travel; if (t >= b2) return z0; const u = (t - a) / (b2 - a); return travel + (z0 - travel) * TL.smooth(u); };
    const rise = (z0, a, b2) => { if (t <= a) return z0; if (t >= b2) return travel; const u = (t - a) / (b2 - a); return z0 + (travel - z0) * TL.smooth(u); };
    const pickZ = task.pickZ || TL.BOX.HC, dropZ = task.dropZ || TL.BOX.HC;
    if (t >= task.pickT0 - 0.01 && t < task.pickT1) {
      if (t < task.attachT) return low(pickZ, task.attachT - 6, task.attachT - 0.5);
      return rise(pickZ, task.attachT, task.pickT1);
    }
    if (t >= task.dropT0 && t < task.dropT1) {
      if (t < task.detachT) return low(dropZ, task.dropT0, task.detachT - 0.5);
      return rise(dropZ, task.detachT + 0.5, task.dropT1);
    }
    return travel;
  }

  const CABS = [TL.GL.hex('#c65a3e'), TL.GL.hex('#5d84a3'), TL.GL.hex('#f4ead9'), TL.GL.hex('#4b8f98'), TL.GL.hex('#e2a93f')];

  function fill(r, sim, t, opts = {}) {
    const b = new Builder(r);
    if (!r.staticBuilt) { for (const s of [r.sBox, r.sCyl, r.sBall, r.sPrism]) s.reset(); scenery(b); r.staticBuilt = true; for (const s of [r.sBox, r.sCyl, r.sBall, r.sPrism]) { s.upload(); s.dirty = false; } }
    for (const s of [r.box, r.cyl, r.ball, r.prism]) s.reset();
    const ships = [], waterShips = [];
    // Ships.
    for (const call of sim.calls) {
      if (call.state === 'planned' || call.state === 'gone') continue;
      const sm = shipMatrix(sim, call);
      call._matrix = sm;
      ships.push({ vessel: call.vessel, matrix: sm.m4 });
      const v = call.vessel;
      const ctr = Sim.shipToWorld(sm.pose, v.hull.L / 2, 0, 5, {});
      waterShips.push({ x: ctr.x, y: ctr.y, hl: v.hull.LOA / 2 - 3, hw: v.hull.B / 2 - 0.5, yaw: sm.pose.yaw || 0 });
      // Which holds are open: bays a crane is working below deck.
      v._open = new Set();
      for (const c of sim.cranes) if (c.call === call && c.bay >= 0) {
        const ph = sim.bayPhase(call, c.bay).phase;
        if (ph === 'holdD' || ph === 'holdL') v._open.add(c.bay);
      }
      b.set(sm.frame);
      shipTop(b, call, sim, LINE_PAL[call.line] || LINE_PAL.CVN);
      b.pop();
      // Mooring lines to the bollards.
      if (call.state === 'working') {
        b.set(F.id());
        const p = sm.pose;
        for (const [sx, dx] of [[v.hull.L - 4, 26], [v.hull.L - 14, -10], [8, -26], [20, 10]]) {
          const a = Sim.shipToWorld(p, sx, -v.hull.halfBreadth(sx, v.hull.D) * 0.9, v.hull.D, {});
          b.beam([a.x, a.y, a.z], [a.x + dx, 1.1, 1.0], 0.14, PAL.ink);
        }
        b.pop();
      }
    }
    // Cranes.
    for (const c of sim.cranes) {
      let x = c.x, y = c.y, z = c.z;
      if (c.gantry) x = CR.evalGantry(c.gantry, t);
      if (c.cycle) {
        const p = CR.evalCycle(c.cycle, t);
        y = p.y; z = p.z;
      }
      const hi = c.call && c.call.state === 'working' ? 0 : 0;
      b.set(F.T(x, 0, 0));
      crane(b, c, y, z, c.box, hi);
      b.pop();
      c._draw = { x, y, z };
    }
    // Boxes on the ground under the cranes.
    for (const [s, box] of sim.ground) {
      const st = sim.scG.states[s];
      b.set(F.id()); boxAt(b, st.x, st.y, box.h / 2, 0, box); b.pop();
    }
    // Yard.
    b.set(F.id());
    for (const st of sim.yard.stacks) {
      let z = 0;
      for (const box of st.boxes) { if (box.loc && box.loc.kind === 'yard') boxAt(b, st.x, st.y, z + box.h / 2, Math.PI / 2, box); z += box.h; }
    }
    b.pop();
    // Straddle carriers.
    for (const sc of sim.scs) {
      M.poseAt(sim.scG, sc.steps, t, tmp);
      sc._draw = { x: tmp.x, y: tmp.y, th: tmp.th };
      b.set(F.mul(F.T(tmp.x, tmp.y, 0), F.Rz(tmp.th)));
      straddle(b, scSpreader(sim, sc, t), sc.box, sc.k + 1);
      b.pop();
    }
    // Trucks (inside the gate, and the queue outside it).
    for (const tr of sim.trucks) {
      if (tr.state === 'gone' || !tr.steps) continue;
      M.poseAt(sim.trG, tr.steps, t, tmp);
      if (sim.trG.states[tr.steps[tr.steps.length - 1].s].tag === 'sink' && t >= tr.goneT) continue;
      if (tmp.x > L.cx(L.NX - 2) + 8) continue;
      tr._draw = { x: tmp.x, y: tmp.y, th: tmp.th };
      b.set(F.mul(F.T(tmp.x, tmp.y, 0), F.Rz(tmp.th)));
      truck(b, CABS[tr.k % CABS.length], tr.box);
      b.pop();
    }
    sim.queue.forEach((tr, i) => {
      const x = L.cx(L.NX - 2) + 22 + i * 19, y = L.cy(L.J.roadW) + (i % 2 ? 0 : 0);
      tr._draw = { x, y, th: Math.PI };
      b.set(F.mul(F.T(x, y, 0), F.Rz(Math.PI)));
      truck(b, CABS[tr.k % CABS.length], tr.box);
      b.pop();
    });
    return { ships, waterShips, decals: opts.decals || null };
  }

  TL.Models = { fill, Builder, shipMatrix, crane, straddle, truck, boxAt, scSpreader };
})(globalThis.TL = globalThis.TL || {});
