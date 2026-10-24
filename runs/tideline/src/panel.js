// panel.js: the right-hand panel. The vessel view pairs a profile stowage
// plan (which explains trim) with an end-on bay section (which explains
// list), gauges that show their limits, the planned departure condition and
// the key particulars. Planned boxes can be dragged to another slot; the
// simulation accepts or refuses the move and says why.
'use strict';
(function (TL) {
  const $ = (s) => document.querySelector(s);
  const L = TL.Layout, S = TL.Stow, fmt = TL.fmt;
  const P = TL.Panel = { tab: 'vessel', bay: null, color: 'type', dirty: true };
  let app;

  const TYPE_COL = { DV: '#5d84a3', HC: '#c65a3e', RF: '#e8dcc4', MT: '#b9bec7' };
  const POD_COL = { ARD: '#28304a', CRN: '#4b8f98', VLM: '#e2a93f', SLP: '#8fa679', TSK: '#c65a3e' };
  const wCol = (w) => { const u = TL.clamp((w - 4) / 26, 0, 1); const a = [233, 220, 197], b = [140, 52, 32]; return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * u)).join(',')})`; };
  P.boxColor = (b) => P.color === 'port' ? POD_COL[b.pod] || '#888' : P.color === 'weight' ? wCol(b.w) : TYPE_COL[b.type];

  P.init = function (a) {
    app = a;
    const tabs = [['vessel', 'ship', 'Vessel'], ['yard', 'yard', 'Yard'], ['equipment', 'crane', 'Equipment'], ['gate', 'gate', 'Gate']];
    $('#tabs').innerHTML = tabs.map(([k, i, l]) => `<button data-t="${k}">${TL.icon(i)}${l}</button>`).join('');
    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) P.show(b.dataset.t); });
    $('#pbody').addEventListener('click', P.onClick);
    $('#pbody').addEventListener('change', P.onChange);
  };
  P.show = function (tab) {
    P.tab = tab; P.built = null; P.dirty = true;
    for (const b of $('#tabs').children) b.classList.toggle('on', b.dataset.t === tab);
  };

  let lastT = 0, lastVer = -1;
  P.update = function (t) {
    const now = performance.now();
    const ver = (app.sim.planVersion || 0) + ':' + (app.vesselCall && app.vesselCall.id) + ':' + P.tab + ':' + (app.sel && app.sel.kind) + ':' + P.bay + ':' + P.color;
    if (P.dirty || ver !== lastVer || now - lastT > 330 || app.still) {
      if (P.drag) return;
      lastT = now; lastVer = ver; P.dirty = false;
      if (P.tab === 'vessel') P.vessel(t);
      else if (P.tab === 'equipment') P.equipment();
      else if (P.tab === 'yard') P.yard();
      else P.gate();
    }
  };

  // ── Vessel ─────────────────────────────────────────────────────────────
  P.vessel = function () {
    const sim = app.sim, call = app.vesselCall || sim.calls[0], v = call.vessel;
    if (P.built !== 'vessel:' + call.id) {
      P.built = 'vessel:' + call.id;
      if (P.bay == null || P.bay >= v.bays.length || P.bayCall !== call) {
        const c = sim.cranes.find(q => q.call === call && q.bay >= 0);
        P.bay = c ? c.bay : Math.floor(v.bays.length / 2);
        P.bayCall = call;
      }
      $('#pbody').innerHTML = `
        <div class="vhead"><h2 id="vName"></h2><span id="vChip"></span><span class="berth" id="vBerth"></span></div>
        <div class="vsub" id="vSub"></div>
        <div class="prog" id="vProg"></div>
        <div class="sect"><h3>Stowage plan<span class="r"><div class="mini" id="colorBy"><button data-c="type">Type</button><button data-c="port">Port</button><button data-c="weight">Weight</button></div></span></h3>
          <div class="cvwrap"><canvas class="cv" id="cvProfile" data-h="172"></canvas></div>
          <div class="legend" id="legend"></div>
        </div>
        <div class="sect"><h3>Bay <span id="bayNo"></span><span class="faint" style="font-weight:500;font-size:12px">end-on, looking forward</span><span class="r baynav"><button data-bay="-1" title="Previous bay">${TL.icon('chevL')}</button><button data-bay="1" title="Next bay">${TL.icon('chev')}</button></span></h3>
          <div class="cvwrap"><canvas class="cv" id="cvBay" data-h="230"></canvas></div>
          <div class="note" id="bayNote"></div>
        </div>
        <div class="sect" id="stabSect"><h3>Stability <span class="faint" style="font-weight:500">(live)</span><span class="r" id="stabState"></span></h3>
          <div class="gauges"><div><div class="gl">Trim</div><canvas id="gTrim" width="336" height="208"></canvas></div><div><div class="gl">Heel</div><canvas id="gHeel" width="336" height="208"></canvas></div></div>
          <div class="stats" id="stabStats"></div>
          <div id="depart"></div>
        </div>
        <div class="sect"><h3>Key particulars</h3><table class="kv" id="partic"></table>
          <div class="note">Particulars are derived from the hull form and the bay plan that fits inside it. Ships, lines and visit references are fictional.</div></div>`;
      P.bindCanvas();
    }
    for (const b of $('#colorBy').children) b.classList.toggle('on', b.dataset.c === P.color);
    const c = sim.condition(call);
    $('#vName').textContent = v.name;
    $('#vChip').innerHTML = TL.UI.stateChip(call);
    $('#vBerth').innerHTML = `${L.BERTHS[call.berth].id}${TL.icon('chev')}`;
    const line = S.LINES[call.line].name;
    const win = sim.callWindow(call);
    const etaLbl = call.state === 'working' ? `Berthed ${dayTime(call.etb)}` : `ETB ${dayTime(call.etb)}`;
    $('#vSub').innerHTML = `${line}<i>|</i>${fmt.int(v.teu)} TEU<i>|</i>${call.visit}<br>${etaLbl}<i>|</i>ETD ${dayTime(win.end)} <span class="faint">projected</span>`;
    const dd = call.done.d, pd = call.planned.d, dl = call.done.l, pl = call.plan.count();
    $('#vProg').innerHTML = `<span class="muted">Discharge</span><div class="b"><i style="width:${(dd / Math.max(1, pd) * 100).toFixed(1)}%;background:var(--teal)"></i></div><span>${dd} / ${pd}</span>
      <span class="muted">Load</span><div class="b"><i style="width:${(dl / Math.max(1, pl) * 100).toFixed(1)}%;background:var(--terracotta)"></i></div><span>${dl} / ${pl}</span>`;
    $('#legend').innerHTML = P.legend();
    $('#bayNo').textContent = String(v.bays[P.bay].no).padStart(2, '0');
    P.drawProfile(call, c);
    P.drawBay(call, c);
    P.gauges(call, c);
    P.particulars(call, c);
  };
  P.legend = function () {
    let items;
    if (P.color === 'type') items = [["40' DV", TYPE_COL.DV], ["40' HC", TYPE_COL.HC], ['Reefer', TYPE_COL.RF], ['Empty', TYPE_COL.MT]];
    else if (P.color === 'port') items = Object.keys(POD_COL).map(k => [S.PORT_NAMES[k] + (k === 'ARD' ? ' (here)' : ''), POD_COL[k]]);
    else items = [['5 t', wCol(5)], ['15 t', wCol(15)], ['25 t', wCol(25)], ['30 t', wCol(30)]];
    return items.map(([l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('') +
      `<span><i style="background:repeating-linear-gradient(135deg,#28304a 0 1.5px,transparent 1.5px 4px);border:1px solid #28304a55"></i>Discharge here</span><span><i style="border:1.5px dashed #28304a;background:transparent"></i>Planned load</span>`;
  };
  function dayTime(t) { const d = TL.UI.dateOf(t); return `${TL.DAYS[d.getUTCDay()]} ${fmt.hm(t)}`; }

  // Canvas helper: size to CSS width at device pixel ratio.
  function prep(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = +cv.dataset.h;
    cv.style.height = h + 'px';
    if (cv.width !== Math.round(w * dpr)) cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    return { g, w, h };
  }
  function hatch(g, x, y, w, h) {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.strokeStyle = 'rgba(40,48,74,0.55)'; g.lineWidth = 1;
    for (let k = -h; k < w; k += 3.5) { g.beginPath(); g.moveTo(x + k, y + h); g.lineTo(x + k + h, y); g.stroke(); }
    g.restore();
  }

  // Pending planned boxes for a stack (not loaded yet), with their final index.
  function plannedOf(call, st) {
    const list = call.plan.stacks[st.id] || [];
    const rob = st.boxes.filter(S.isRob).length;
    return list.map((b, k) => ({ b, idx: rob + k })).filter(o => !o.b.loaded);
  }

  // ── Profile: side elevation, bow on the left ───────────────────────────
  P.drawProfile = function (call, cond) {
    const cv = $('#cvProfile'); const { g, w, h } = prep(cv);
    const v = call.vessel, hull = v.hull;
    const padL = 12, padR = 12, top = 22, base = h - 16;
    const sx = (w - padL - padR) / (hull.xFwd - hull.xAft);
    const zTopMax = v.stacks.reduce((m, s) => Math.max(m, s.top), 0) + 4;
    // Heights drawn up to 2.4x the length scale, so tiers stay legible.
    const sz = Math.min(sx * 2.4, (base - top) / zTopMax);
    const X = (x) => padL + (hull.xFwd - x) * sx, Z = (z) => base - z * sz;
    P.prof = { X, Z, sx, sz, call, top, base };
    // Water and the waterline (trim exaggerated x8).
    const ex = 8, Tm = (cond.Ta + cond.Tf) / 2;
    const zA = Tm + (cond.Ta - Tm) * ex, zF = Tm + (cond.Tf - Tm) * ex;
    g.fillStyle = 'rgba(75,143,152,0.16)';
    g.beginPath(); g.moveTo(0, Z(zF)); g.lineTo(w, Z(zA)); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill();
    // Hull profile.
    const bottom = (x) => { for (let z = 0; z < hull.D; z += 0.25) if (hull.halfBreadth(x, z) > 0.05) return z; return hull.D; };
    g.beginPath();
    const n = 90;
    for (let i = 0; i <= n; i++) { const x = hull.xAft + (hull.xFwd - hull.xAft) * i / n; const z = bottom(x); i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)); }
    g.lineTo(X(hull.xFwd), Z(hull.D + 1.5)); g.lineTo(X(hull.xAft), Z(hull.D + 0.5)); g.closePath();
    // A cutaway: paper inside, the hull as a navy outline with the red
    // antifouling as a band along the bottom, so the boxes read clearly.
    g.save(); g.clip();
    g.fillStyle = '#ece3d3'; g.fillRect(0, 0, w, h);
    g.restore();
    g.save(); g.lineWidth = 2.2; g.strokeStyle = '#2c3a5a'; g.stroke(); g.restore();
    g.save(); g.clip(); g.lineWidth = 5; g.strokeStyle = 'rgba(180,82,59,0.75)';
    g.beginPath();
    for (let i = 0; i <= n; i++) { const x = hull.xAft + (hull.xFwd - hull.xAft) * i / n; const z = bottom(x); i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)); }
    g.stroke(); g.restore();
    // Accommodation.
    const ac = v.accom, decks = Math.max(4, Math.round((v.c.eye - 2 - hull.D) / 2.8));
    g.fillStyle = '#f7f2ea'; g.strokeStyle = 'rgba(40,48,74,0.35)'; g.lineWidth = 1;
    g.fillRect(X(ac.x1), Z(hull.D + decks * 2.8 + 2.8), (ac.x1 - ac.x0) * sx, decks * 2.8 * sz + 2.8 * sz);
    g.fillStyle = '#33445f';
    for (let k = 0; k < decks; k++) for (let x = ac.x0 + 2; x < ac.x1 - 1; x += 3) g.fillRect(X(x) - 1, Z(hull.D + k * 2.8 + 2), 2, 1.5);
    // Boxes: per bay and tier, the outermost starboard box (the side we see).
    for (const bay of v.bays) {
      const sts = bay.stacks.map(id => v.stacks[id]);
      for (const deck of [false, true]) {
        const list = sts.filter(s => s.deck === deck).sort((a, b) => b.y - a.y);
        if (!list.length) continue;
        const maxT = Math.max(...list.map(s => s.maxTiers));
        for (let k = 0; k < maxT; k++) {
          let box = null, planned = null, stack = null;
          for (const s of list) { if (s.boxes[k]) { box = s.boxes[k]; stack = s; break; } }
          if (!box) for (const s of list) { const p = plannedOf(call, s).find(o => o.idx === k); if (p) { planned = p.b; stack = s; break; } }
          const s0 = list[0];
          const z0 = s0.base + k * TL.BOX.H, hh = TL.BOX.H;
          const x0 = X(bay.x + 6.3), bw = 12.6 * sx - 1, y0 = Z(z0 + hh), bh = hh * sz - 1;
          if (box) {
            g.fillStyle = P.boxColor(box); g.fillRect(x0, y0, bw, bh);
            if (box.pod === S.PORT && !box.loaded) hatch(g, x0, y0, bw, bh);
          } else if (planned) {
            g.setLineDash([2, 2]); g.strokeStyle = P.boxColor(planned); g.lineWidth = 1.4; g.strokeRect(x0 + 0.7, y0 + 0.7, bw - 1.4, bh - 1.4); g.setLineDash([]);
          }
        }
      }
    }
    // Waterline drawn over the hull.
    g.strokeStyle = '#4b8f98'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, Z(zF)); g.lineTo(w, Z(zA)); g.stroke();
    // Selected bay and cranes.
    const bay = v.bays[P.bay];
    g.strokeStyle = '#c65a3e'; g.lineWidth = 1.6;
    g.strokeRect(X(bay.x + 6.6), top - 2, 13.2 * sx, base - top + 2);
    g.font = '600 10px Inter, system-ui, sans-serif'; g.textAlign = 'center';
    for (const c of app.sim.cranes) {
      if (c.call !== call || c.bay < 0) continue;
      const bx = X(v.bays[c.bay].x);
      g.fillStyle = '#28304a'; g.fillRect(bx - 15, 4, 30, 13);
      g.fillStyle = '#fff'; g.fillText(c.id, bx, 14);
    }
    g.textAlign = 'left'; g.fillStyle = '#5b6378'; g.font = '600 10px Inter, system-ui, sans-serif';
    g.fillText(`F ${cond.Tf.toFixed(2)} m`, 4, h - 3);
    g.textAlign = 'right'; g.fillText(`A ${cond.Ta.toFixed(2)} m`, w - 4, h - 3);
    g.textAlign = 'center'; g.fillStyle = '#8a8f9c'; g.fillText(`Bow · heights ×${(sz / sx).toFixed(1)}, trim ×8 · Stern`, w / 2, h - 3);
  };

  // ── Bay section: rows across, port on the left (looking forward) ───────
  P.drawBay = function (call, cond) {
    const cv = $('#cvBay'); const { g, w, h } = prep(cv);
    const v = call.vessel, hull = v.hull, bay = v.bays[P.bay];
    const sts = bay.stacks.map(id => v.stacks[id]);
    const zMax = Math.max(...sts.map(s => s.top)) + 2;
    const s = Math.min((w - 70) / (hull.B + 4), (h - 34) / zMax);
    const cx = w / 2 + 10, base = h - 20;
    // Port on the left: starboard (+y) to the right.
    const X = (y) => cx + y * s, Z = (z) => base - z * s;
    P.bayGeo = { X, Z, s, sts, call };
    // Water, with the list exaggerated x4 (heel to starboard lowers the right).
    const ex = 4, heel = cond.heel * ex * Math.PI / 180;
    const wl = cond.T, wY = (px) => Z(wl) + (px - cx) * Math.tan(heel);
    g.fillStyle = 'rgba(75,143,152,0.16)';
    g.beginPath(); g.moveTo(0, wY(0)); g.lineTo(w, wY(w)); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill();
    // Hull section at this bay.
    g.beginPath();
    const pts = [];
    for (let z = 0; z <= hull.D; z += 0.4) pts.push([hull.halfBreadth(bay.x, z), z]);
    pts.forEach(([y, z], i) => (i ? g.lineTo(X(y), Z(z)) : g.moveTo(X(y), Z(z))));
    for (let i = pts.length - 1; i >= 0; i--) g.lineTo(X(-pts[i][0]), Z(pts[i][1]));
    g.closePath();
    g.fillStyle = '#e9dfcd'; g.fill();
    g.strokeStyle = '#2c3a5a'; g.lineWidth = 2; g.stroke();
    // Coaming and hatch cover over the hold (open while a crane works it).
    const hd = v.c.D + TL.VESSEL.COAMING + TL.VESSEL.HATCH;
    const holdW = sts.filter(st => !st.deck).length * TL.VESSEL.ROW_PITCH / 2 + 0.6;
    const open = v._open && v._open.has(P.bay);
    g.fillStyle = '#c9bea9';
    g.fillRect(X(-holdW) - 2, Z(hd - TL.VESSEL.HATCH), 3, TL.VESSEL.COAMING * s);
    g.fillRect(X(holdW) - 1, Z(hd - TL.VESSEL.HATCH), 3, TL.VESSEL.COAMING * s);
    if (!open) { g.fillStyle = '#6f7f86'; g.fillRect(X(-holdW) - 2, Z(hd), (2 * holdW) * s + 4, TL.VESSEL.HATCH * s + 1); }
    else { g.fillStyle = '#5b6378'; g.font = '600 9.5px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('hatch open', X(0), Z(hd) - 2); }
    // Slots.
    const cw = TL.VESSEL.ROW_PITCH * s - 1.5;
    P.slots = [];
    for (const st of sts) {
      const x0 = X(st.y) - cw / 2;
      const planned = plannedOf(call, st);
      let z = st.base;
      for (let k = 0; k < st.maxTiers; k++) {
        const box = st.boxes[k];
        const pl = !box ? planned.find(o => o.idx === k) : null;
        const hh = (box ? box.h : pl ? pl.b.h : TL.BOX.H);
        const y0 = Z(z + hh) + 0.7, bh = hh * s - 1.4;
        if (!st.deck && z + hh > st.top + 0.01) break;
        P.slots.push({ st, idx: k, x: x0, y: y0, w: cw, h: bh, box, planned: pl && pl.b });
        if (box) {
          g.fillStyle = P.boxColor(box); g.fillRect(x0, y0, cw, bh);
          if (box.pod === S.PORT && !box.loaded) hatch(g, x0, y0, cw, bh);
          if (box.busy) { g.strokeStyle = '#c65a3e'; g.lineWidth = 1.5; g.strokeRect(x0, y0, cw, bh); }
        } else if (pl) {
          const locked = pl.b.reserved;
          g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x0, y0, cw, bh);
          g.setLineDash(locked ? [] : [3, 2]); g.strokeStyle = P.boxColor(pl.b); g.lineWidth = locked ? 1.4 : 1.6;
          g.strokeRect(x0 + 0.8, y0 + 0.8, cw - 1.6, bh - 1.6); g.setLineDash([]);
          if (locked) { g.fillStyle = P.boxColor(pl.b); g.globalAlpha = 0.35; g.fillRect(x0, y0, cw, bh); g.globalAlpha = 1; }
        } else {
          g.strokeStyle = 'rgba(40,48,74,0.10)'; g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, cw - 1, bh - 1);
        }
        z += hh;
      }
    }
    // Drop highlight.
    if (P.drag && P.drag.over && P.drag.over.kind === 'bay') {
      const o = P.drag.over.slot;
      g.strokeStyle = P.drag.over.bad ? '#c65a3e' : '#4b8f98'; g.lineWidth = 2.2; g.strokeRect(o.x - 1, o.y - 1, o.w + 2, o.h + 2);
    }
    if (P.flash && performance.now() - P.flash.t < 1600 && P.flash.call === call && P.flash.st.bay === P.bay) {
      const o = P.slots.find(q => q.st === P.flash.st && q.idx === P.flash.idx);
      if (o) { g.fillStyle = P.flash.ok ? 'rgba(111,154,94,0.45)' : 'rgba(198,90,62,0.45)'; g.fillRect(o.x - 1, o.y - 1, o.w + 2, o.h + 2); }
    }
    // K, G and M on the centreline: GM is the gap between G and M.
    const kx = 16;
    const zG = cond.KGf, zM = cond.KMT;
    g.strokeStyle = '#28304a'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(kx, Z(0)); g.lineTo(kx, Z(Math.max(zG, zM) + 1)); g.stroke();
    g.fillStyle = cond.GM < 0.15 ? '#c65a3e' : cond.GM < 0.5 ? '#d39a2c' : '#6f9a5e';
    g.fillRect(kx - 3, Z(zM), 6, (zM - zG) * s);
    g.font = '600 10px Inter, system-ui, sans-serif'; g.fillStyle = '#28304a'; g.textAlign = 'left';
    for (const [lbl, z] of [['K', 0], ['G', zG], ['M', zM]]) { g.beginPath(); g.arc(kx, Z(z), 2.6, 0, 7); g.fill(); g.fillText(lbl, kx + 6, Z(z) + (lbl === 'G' ? 9 : lbl === 'M' ? -2 : 3)); }
    g.fillStyle = '#5b6378';
    g.textAlign = 'right'; g.fillText('Port', X(-hull.B / 2) - 6, Z(2));
    g.textAlign = 'left'; g.fillText('Starboard', X(hull.B / 2) + 6, Z(2));
    g.textAlign = 'center';
    g.fillText(`list ${Math.abs(cond.heel).toFixed(2)}°${cond.heel > 0.005 ? ' to starboard' : cond.heel < -0.005 ? ' to port' : ''} · waterline shown ×4`, cx, h - 5);
    const nPl = sts.reduce((n, st) => n + plannedOf(call, st).length, 0);
    const nDis = sts.reduce((n, st) => n + st.boxes.filter(b => b.pod === S.PORT && !b.loaded).length, 0);
    const cr = app.sim.cranes.find(q => q.call === call && q.bay === P.bay);
    $('#bayNote').innerHTML = `${nDis} to discharge, ${nPl} planned to load${cr ? ` · <b>${cr.id}</b> working here` : ''}. Drag a dashed box to re-plan it; the console checks stack weight, hold height, reefer sockets, the bridge's line of sight (SOLAS V/22) and the departure stability before accepting.`;
  };

  // ── Gauges ─────────────────────────────────────────────────────────────
  function gauge(cv, value, min, max, okLim, outLim, label, unit) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H - 52, R = Math.min(W / 2 - 22, cy - 10);
    const ang = (v) => Math.PI + (TL.clamp(v, min, max) - min) / (max - min) * Math.PI;
    const arc = (a, b, col, lw) => { g.beginPath(); g.arc(cx, cy, R, ang(a), ang(b)); g.strokeStyle = col; g.lineWidth = lw; g.stroke(); };
    arc(min, max, '#e5ddd0', 16);
    arc(-outLim, outLim, '#f1d9a6', 16);
    arc(-okLim, okLim, '#a9c79a', 16);
    arc(min, -outLim, '#eab7a6', 16); arc(outLim, max, '#eab7a6', 16);
    // Ticks.
    g.strokeStyle = 'rgba(40,48,74,0.45)'; g.lineWidth = 2;
    for (const t of [min, -outLim, 0, outLim, max]) { const a = ang(t); g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12)); g.lineTo(cx + Math.cos(a) * (R + 12), cy + Math.sin(a) * (R + 12)); g.stroke(); }
    // Needle.
    const a = ang(value);
    g.strokeStyle = '#28304a'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 26), cy + Math.sin(a) * (R - 26)); g.lineTo(cx + Math.cos(a) * (R + 10), cy + Math.sin(a) * (R + 10)); g.stroke();
    g.fillStyle = '#28304a'; g.font = '700 38px Inter, system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText(label, cx, cy - 4);
    g.font = '600 20px Inter, system-ui, sans-serif'; g.fillStyle = '#8a8f9c';
    g.fillText(min.toFixed(1), cx - R, cy + 34); g.fillText(max.toFixed(1), cx + R, cy + 34);
    g.font = '600 18px Inter, system-ui, sans-serif'; g.fillStyle = '#5b6378';
    g.fillText(unit, cx, cy + 26);
  }
  P.gauges = function (call, c) {
    const lim = TL.Stability.LIMITS;
    gauge($('#gTrim'), c.trim, -lim.trimMax, lim.trimMax, lim.trimMax * 0.75, lim.trimMax, (c.trim >= 0 ? '+' : '−') + Math.abs(c.trim).toFixed(2) + ' m', c.trim > 0.02 ? 'by the stern' : c.trim < -0.02 ? 'by the head' : 'even keel');
    gauge($('#gHeel'), c.heel, -5, 5, lim.heelOps * 0.7, lim.heelOps, (c.heel >= 0 ? '' : '−') + Math.abs(c.heel).toFixed(2) + '°', c.heel > 0.005 ? 'to starboard' : c.heel < -0.005 ? 'to port' : 'upright');
    const a = TL.Stability.assess(c, { depth: L.BERTHS[call.berth].depth });
    $('#stabState').innerHTML = a.state === 'ok' ? `<span style="color:var(--ok)">${TL.icon('check')}</span><span style="color:var(--ok)">Within limits</span>` : a.state === 'near' ? `<span class="chip amber">Near limit</span>` : `<span class="chip red">Out of limits</span>`;
    const ukc = L.BERTHS[call.berth].depth - c.maxDraft;
    const P0 = call.vessel.tanks.ahP, S0 = call.vessel.tanks.ahS;
    $('#stabStats').innerHTML = `<div><b>${c.GM.toFixed(2)} m</b><span>GM (min 0.15)</span></div><div><b>${c.Tf.toFixed(1)} / ${c.Ta.toFixed(1)}</b><span>Draft F / A, m</span></div><div><b>${fmt.int(c.W)} t</b><span>Displacement</span></div>
      <div><b>${ukc.toFixed(1)} m</b><span>Under keel at ${L.BERTHS[call.berth].id}</span></div><div><b>${Math.round(P0.cap * P0.fill)} / ${Math.round(S0.cap * S0.fill)} t</b><span>Anti-heel P / S</span></div><div><b>${c.isCodeOk ? 'Pass' : 'Fail'}</b><span>IS Code 2008</span></div>`;
    // Planned departure.
    const val = S.validatePlan(call.vessel, call.plan, { depth: L.BERTHS[call.berth].depth });
    const d = val.cond;
    const cls = val.ok ? (val.assess.state === 'near' ? 'amber' : '') : 'red';
    $('#depart').innerHTML = `<div class="verdict ${cls}">${TL.icon(val.ok ? 'check' : 'alert')}<div><b>Departure plan ${val.ok ? 'within limits' : 'not safe'}</b><br>GM ${d.GM.toFixed(2)} m · trim ${d.trim >= 0 ? '+' : '−'}${Math.abs(d.trim).toFixed(2)} m · draft ${d.maxDraft.toFixed(1)} m · list ${Math.abs(d.heel).toFixed(2)}° after ${Math.abs(d.antiHeel).toFixed(0)} t anti-heel${val.ok ? '' : '<br>' + val.errs.slice(0, 2).join('<br>')}</div></div>`;
  };
  P.particulars = function (call, c) {
    const v = call.vessel, p = v.particulars;
    const pl = call.planned.d + call.plan.count(), dn = call.done.d + call.done.l;
    $('#partic').innerHTML = [
      ['LOA / beam', `${p.LOA.toFixed(1)} m / ${p.B.toFixed(1)} m`],
      ['Design draft', `${p.Tdes.toFixed(1)} m`],
      ['Current draft (mean)', `${c.Tmean.toFixed(2)} m`],
      ['Deadweight', `${fmt.int(p.dwt)} t`],
      ['Capacity (bay plan)', `${fmt.int(p.teu)} TEU in ${v.bays.length} bays`],
      ['Planned moves', fmt.int(pl)],
      ['Completed moves', `${fmt.int(dn)} (${(dn / Math.max(1, pl) * 100).toFixed(0)}%)`],
    ].map(([k, x]) => `<tr><td class="muted">${k}</td><td>${x}</td></tr>`).join('');
  };

  // ── Drag and drop on the stowage plan ─────────────────────────────────
  P.bindCanvas = function () {
    const bay = $('#cvBay'), prof = $('#cvProfile');
    const slotAt = (e) => {
      const r = bay.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      return (P.slots || []).find(o => x >= o.x - 1 && x <= o.x + o.w + 1 && y >= o.y - 1 && y <= o.y + o.h + 1);
    };
    bay.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const o = slotAt(e);
      if (!o || !o.planned) {
        if (o && o.box) TL.UI.toast('', o.box.id, `${S.TYPES[o.box.type].label} · ${o.box.w.toFixed(1)} t · to ${S.PORT_NAMES[o.box.pod]} · ${app.vesselCall.vessel.brt(o.st.id, o.idx)}${o.box.pod === S.PORT ? ' · discharges here' : ' · stays on board'}`, 3500);
        return;
      }
      if (o.planned.reserved) { TL.UI.toast('amber', 'Already on its way', `${o.planned.id} is being fetched for the crane; it can no longer be re-planned.`); return; }
      P.drag = { box: o.planned, from: o, x: e.clientX, y: e.clientY };
      bay.setPointerCapture(e.pointerId);
      const d = $('#drag'); d.style.display = 'block';
      d.innerHTML = `${o.planned.id} · ${S.TYPES[o.planned.type].label} · ${o.planned.w.toFixed(1)} t`;
    });
    const move = (e) => {
      if (!P.drag) return;
      const d = $('#drag'); d.style.left = e.clientX + 14 + 'px'; d.style.top = e.clientY + 10 + 'px';
      const o = slotAt(e);
      P.drag.over = o ? { kind: 'bay', slot: o } : null;
      // Over the profile: hover a bay.
      const pr = prof.getBoundingClientRect();
      if (!o && e.clientX >= pr.left && e.clientX <= pr.right && e.clientY >= pr.top && e.clientY <= pr.bottom) {
        const b = P.profileBay(e.clientX - pr.left);
        if (b != null && b !== P.bay) { P.bay = b; P.dirty = true; }
      }
      const call = app.vesselCall, c = app.sim.condition(call);
      P.drawBay(call, c);
    };
    bay.addEventListener('pointermove', move);
    bay.addEventListener('pointerup', (e) => {
      if (!P.drag) return;
      $('#drag').style.display = 'none';
      const o = slotAt(e), dr = P.drag; P.drag = null;
      if (!o || (o.st === dr.from.st && o.idx === dr.from.idx)) { P.dirty = true; return; }
      P.tryDrop(dr.box, o.st, o.idx);
    });
    // A cancelled pointer drops nothing.
    const cancel = () => { if (!P.drag) return; P.drag = null; $('#drag').style.display = 'none'; P.dirty = true; };
    bay.addEventListener('pointercancel', cancel);
    bay.addEventListener('lostpointercapture', () => setTimeout(cancel, 0));
    prof.addEventListener('click', (e) => {
      const r = prof.getBoundingClientRect();
      const b = P.profileBay(e.clientX - r.left);
      if (b != null) { P.bay = b; P.dirty = true; }
    });
  };
  P.profileBay = function (px) {
    const pr = P.prof; if (!pr) return null;
    const v = pr.call.vessel;
    let best = null, bd = 9;
    v.bays.forEach((b, i) => { const d = Math.abs(pr.X(b.x) - px); if (d < bd * pr.sx * 1.2 + 6 && (best == null || d < bd)) { best = i; bd = d; } });
    return best;
  };
  P.tryDrop = function (box, st, idx) {
    const call = app.vesselCall, sim = app.sim;
    const before = S.departureCondition(call.vessel, call.plan);
    const r = sim.replan(call, box, st.id, idx);
    P.flash = { call, st, idx, ok: r.ok, t: performance.now() };
    if (r.ok) {
      app.ripple = { box, call, slot: call.vessel.brt(st.id, idx), until: performance.now() + 12000 };
      const d = r.cond;
      TL.UI.toast('ok', 'Re-planned ' + box.id, `Now ${call.vessel.brt(st.id, Math.min(idx, (call.plan.where(box) || {}).idx + st.boxes.filter(S.isRob).length))}. Departure GM ${before.GM.toFixed(2)} → ${d.GM.toFixed(2)} m, trim ${before.trim.toFixed(2)} → ${d.trim.toFixed(2)} m.` + (r.warns && r.warns.length && r.warns.some(w => /heavy/.test(w)) ? ' Heavy box above a lighter one.' : ''));
    } else {
      TL.UI.toast('red', 'Refused', r.errs.slice(0, 2).join('; '), 7000);
    }
    P.dirty = true;
    return r;
  };

  P.onClick = function (e) {
    const b = e.target.closest('button');
    if (!b) {
      const row = e.target.closest('[data-sel]');
      if (row) {
        const [k, i] = row.dataset.sel.split(':');
        const sim = app.sim;
        if (k === 'crane') TL.UI.select('crane', sim.cranes[+i], { fly: true, keepTab: true });
        if (k === 'sc') TL.UI.select('sc', sim.scs[+i], { fly: true, keepTab: true });
        if (k === 'block') TL.UI.select('block', L.BLOCKS[+i], { fly: true, keepTab: true });
        if (k === 'truck') { const tr = sim.trucks.find(x => x.k === +i); if (tr) TL.UI.select('truck', tr, { fly: true, keepTab: true }); }
      }
      return;
    }
    if (b.dataset.c) { P.color = b.dataset.c; P.dirty = true; }
    if (b.dataset.bay) { const v = app.vesselCall.vessel; P.bay = (P.bay + +b.dataset.bay + v.bays.length) % v.bays.length; P.dirty = true; }
  };
  P.onChange = function (e) {
    const s = e.target.closest('select[data-crane]');
    if (!s) return;
    const sim = app.sim, k = +s.dataset.crane;
    const call = s.value === '' ? null : sim.calls[+s.value];
    const r = sim.assignCrane(k, call);
    if (r.ok) TL.UI.toast('ok', `${sim.cranes[k].id} ${call ? '→ ' + call.vessel.name : 'released'}`, r.waiting ? 'It finishes its current move and any box on its way, then gantries over.' : '');
    else TL.UI.toast('red', 'Cannot reassign', r.errs.join('; '), 7000);
    P.built = null; P.dirty = true;
  };

  // ── Equipment ──────────────────────────────────────────────────────────
  P.equipment = function () {
    const sim = app.sim;
    const sel = app.sel || {};
    const working = sim.calls.filter(c => c.state === 'working');
    if (P.built !== 'equipment') { P.built = 'equipment'; $('#pbody').innerHTML = `<div class="cap">Ship-to-shore cranes</div><div class="list" id="eqCranes" style="margin-top:8px"></div><div class="sect"><h3>Straddle carriers <span class="r muted" id="scSum"></span></h3><div class="list" id="eqScs"></div><div class="note">Every carrier drives a path reserved cell by cell in space and time (SIPP, token passing), ending in a parking pocket no route crosses: no two can meet, and none can wait for ever. tools/check.js proves it over many seeds.</div></div>`; }
    const focus = document.activeElement && document.activeElement.tagName === 'SELECT';
    if (!focus) $('#eqCranes').innerHTML = sim.cranes.map(c => {
      const mph = c.moves.filter(m => m > sim.t - 3600).length;
      const opts = `<option value="">Unassigned</option>` + working.map(w => `<option value="${w.id}" ${c.call === w || c.pending === w ? 'selected' : ''}>${w.vessel.name} (${L.BERTHS[w.berth].id})</option>`).join('');
      const chip = c.status === 'Stability hold' ? 'red' : /Wait|clearance/.test(c.status) ? 'amber' : /Idle|Finished/.test(c.status) ? 'grey' : '';
      return `<div class="row ${sel.ref === c ? 'sel' : ''}" data-sel="crane:${c.k}"><div class="ic">${TL.icon('crane')}</div><div><b>${c.id}</b> <span class="chip ${chip}">${c.pendingSet ? 'Reassigning' : c.status}</span><small>${mph} moves/hr · ${c.moves.length} moves this shift${c.hold ? ' · ' + c.hold.reason : ''}</small></div><select data-crane="${c.k}" title="Assign crane">${opts}</select></div>`;
    }).join('');
    const busy = sim.scs.filter(s => s.task).length;
    $('#scSum').textContent = `${busy} busy · ${sim.scs.length - busy} free`;
    const list = sim.scs.slice().sort((a, b) => (sel.ref === b) - (sel.ref === a) || (!!b.task) - (!!a.task)).slice(0, 10);
    $('#eqScs').innerHTML = list.map(s => `<div class="row ${sel.ref === s ? 'sel' : ''}" data-sel="sc:${s.k}"><div class="ic">${TL.icon('straddle')}</div><div><b>${s.id}</b><small>${s.task ? `${s.status} · ${s.task.box.id}` : s.status}</small></div><span class="faint">${s.moves} moves</span></div>`).join('');
  };

  // ── Yard ───────────────────────────────────────────────────────────────
  P.yard = function () {
    const sim = app.sim, sel = app.sel || {};
    const B = sel.kind === 'block' ? sel.ref : L.BLOCKS.find(b => b.name === 'C1');
    const stat = (blk) => {
      const st = sim.yard.stacks.filter(s => s.block === blk);
      let n = 0, imp = 0, exp = 0, rf = 0;
      for (const s of st) for (const b of s.boxes) { n++; if (b.imported) imp++; else exp++; if (b.reefer) rf++; }
      return { n, imp, exp, rf, cap: st.length * L.SLOT_TIERS };
    };
    const cells = L.BLOCKS.slice().sort((a, b) => b.row - a.row || a.col - b.col).map(blk => {
      const s = stat(blk), u = s.n / s.cap;
      const col = `rgba(198,90,62,${(0.12 + u * 0.8).toFixed(2)})`;
      return `<div data-sel="block:${L.BLOCKS.indexOf(blk)}" style="cursor:pointer;border-radius:7px;padding:6px 4px;text-align:center;background:${col};${blk === B ? 'outline:2px solid #28304a;' : ''}"><b style="font-size:12px">${blk.name}</b><br><span style="font-size:11px">${(u * 100).toFixed(0)}%</span></div>`;
    }).join('');
    const s = stat(B);
    const k = sim.kpi();
    $('#pbody').innerHTML = `<div class="cap">Yard occupancy by block</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-top:8px">${cells}</div><div class="note">Inland row (2) above, quay row (1) below. Exports stage in row 1, imports wait for trucks in row 2, reefers plug in at D2.</div>
      <div class="sect"><h3>Block ${B.name}${B.reefer ? ' <span class="chip blue">Reefer</span>' : ''}<span class="r">${(s.n / s.cap * 100).toFixed(0)}%</span></h3>
      <table class="kv"><tr><td class="muted">Boxes / capacity</td><td>${s.n} / ${s.cap} (${s.n * 2} TEU)</td></tr><tr><td class="muted">Imports waiting for trucks</td><td>${s.imp}</td></tr><tr><td class="muted">Exports for coming calls</td><td>${s.exp}</td></tr><tr><td class="muted">Reefers</td><td>${s.rf}</td></tr><tr><td class="muted">Stacking</td><td>${B.i1 - B.i0 + 1} rows × ${B.slots.length} slots, ${L.SLOT_TIERS} high (1-over-${L.SLOT_TIERS - 1})</td></tr></table></div>
      <div class="sect"><h3>Terminal</h3><table class="kv"><tr><td class="muted">Yard</td><td>${fmt.int(k.yardTEU)} / ${fmt.int(k.yardCap)} TEU</td></tr><tr><td class="muted">Rehandles this run</td><td>${k.rehandles}</td></tr><tr><td class="muted">Boxes waiting on the apron</td><td>${sim.ground.size}</td></tr></table>
      <div class="note">A rehandle is a move that only digs out a box buried under others. Category stowage (any export of the same port, type and weight class may take a planned slot) keeps them down.</div></div>`;
  };

  // ── Gate ───────────────────────────────────────────────────────────────
  P.gate = function () {
    const sim = app.sim, k = sim.kpi(), sel = app.sel || {};
    const inside = sim.trucks.filter(t => t.state !== 'gone' && t.state !== 'queued').slice(-9).reverse();
    $('#pbody').innerHTML = `<div class="stats" style="margin-top:0"><div><b>${k.queue}</b><span>In the queue</span></div><div><b>${k.inside}</b><span>Inside the gate</span></div><div><b>${k.turn != null ? (k.turn / 60).toFixed(0) + ' min' : '—'}</b><span>Turn time (1 h)</span></div></div>
      <div class="sect"><h3>Trucks inside</h3><div class="list">${inside.map(t => `<div class="row ${sel.ref === t ? 'sel' : ''}" data-sel="truck:${t.k}"><div class="ic">${TL.icon('truck')}</div><div><b>${t.id}</b><small>${t.kind === 'delivery' ? 'Export delivery' : 'Import pickup'} · ${t.status}${t.bay != null ? ' · ' + L.BAYS[t.bay].id : ''}</small></div><span class="faint">${t.gateInT != null ? Math.round((sim.t - t.gateInT) / 60) + ' min' : ''}</span></div>`).join('')}</div></div>
      <div class="note">Trucks check in at the gate, reverse into a transfer bay, and wait while a straddle carrier lifts a box on or off the trailer from behind. Arrivals are random at ${sim.truckRate} an hour.</div>`;
  };
})(globalThis.TL = globalThis.TL || {});
