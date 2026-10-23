// schedule.js: the berth schedule. One monotonic time axis with dates at
// midnight, a moving NOW line, a bar per call on exactly one berth. Calls not
// yet alongside can be dragged in time or to another berth; the simulation
// checks quay length and water depth and pushes later calls back.
'use strict';
(function (TL) {
  const $ = (s) => document.querySelector(s);
  const L = TL.Layout, fmt = TL.fmt;
  const SC = TL.Schedule = { span: 48 * 3600, before: 6 * 3600 };
  let app, geo = null;
  const LINE_COL = { CVN: '#c65a3e', BRW: '#4b8f98', NMF: '#5d84a3', ALD: '#e2a93f' };

  SC.init = function (a) {
    app = a;
    const r = $('#schedRange');
    r.innerHTML = [24, 48, 72].map(h => `<button data-h="${h}" class="${h === 48 ? 'on' : ''}">${h} h</button>`).join('');
    r.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; SC.span = +b.dataset.h * 3600; SC.before = SC.span / 8; for (const x of r.children) x.classList.toggle('on', x === b); SC.draw(); });
    const cv = $('#gantt');
    cv.addEventListener('pointerdown', SC.down);
    cv.addEventListener('pointermove', SC.move);
    cv.addEventListener('pointerup', SC.up);
    cv.addEventListener('pointerleave', () => { if (!SC.drag) $('#schedTip').style.display = 'none'; });
  };
  SC.flash = function () { SC.flashT = performance.now(); };

  function bars() {
    const sim = app.sim, out = [];
    for (const call of sim.calls) {
      if (call.state === 'gone' && (call.departT || 0) < sim.t - SC.before) continue;
      const w = sim.callWindow(call);
      out.push({ call, berth: call.berth, start: w.start, end: w.end, waitFrom: call.state === 'anchored' ? Math.min(call.eta, sim.t) : null });
    }
    return out;
  }

  SC.draw = function () {
    const cv = $('#gantt');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const sim = app.sim, now = app.simT || sim.t;
    const t0 = Math.floor((now - SC.before) / 3600) * 3600, t1 = t0 + SC.span;
    const left = 92, top = 24, rowH = (H - top - 2) / L.BERTHS.length;
    const X = (t) => left + (t - t0) / (t1 - t0) * (W - left - 4);
    geo = { X, t0, t1, left, top, rowH, W, H, T: (x) => t0 + (x - left) / (W - left - 4) * (t1 - t0) };
    // Rows.
    g.font = '600 12px Inter, system-ui, sans-serif';
    L.BERTHS.forEach((B, i) => {
      const y = top + i * rowH;
      g.fillStyle = i % 2 ? 'rgba(233,220,197,0.35)' : 'rgba(233,220,197,0.18)';
      g.fillRect(left, y + 1, W - left - 4, rowH - 2);
      g.fillStyle = '#28304a'; g.textAlign = 'left'; g.fillText(B.id, 6, y + rowH / 2 - 2);
      g.font = '500 10.5px Inter, system-ui, sans-serif'; g.fillStyle = '#8a8f9c';
      g.fillText(`${(B.x1 - B.x0).toFixed(0)} m · ${B.depth.toFixed(1)} m`, 6, y + rowH / 2 + 12);
      g.font = '600 12px Inter, system-ui, sans-serif';
    });
    // Time axis: ticks every 3 h (6 h when long), dates at midnight.
    const step = SC.span > 50 * 3600 ? 6 * 3600 : 3 * 3600;
    g.textAlign = 'center';
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
      const x = X(t), d = TL.UI.dateOf(t), mid = d.getUTCHours() === 0;
      g.strokeStyle = mid ? 'rgba(40,48,74,0.30)' : 'rgba(40,48,74,0.10)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, top - 4); g.lineTo(x, H - 2); g.stroke();
      g.fillStyle = mid ? '#28304a' : '#8a8f9c'; g.font = (mid ? '650' : '500') + ' 10.5px Inter, system-ui, sans-serif';
      g.fillText(mid ? `${TL.DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${TL.MONTHS[d.getUTCMonth()]}` : fmt.hm(t), x, 12);
    }
    // Bars.
    const list = bars();
    geo.bars = [];
    for (const b of list) {
      let berth = b.berth, start = b.start, end = b.end;
      const dragging = SC.drag && SC.drag.call === b.call;
      if (dragging) { berth = SC.drag.berth; const dt = SC.drag.dt; start += dt; end += dt; }
      const y = top + berth * rowH + 5, h = rowH - 10;
      const x0 = X(Math.max(start, t0 - 3600)), x1 = X(Math.min(end, t1 + 3600));
      if (x1 < left || x0 > W) continue;
      const col = LINE_COL[b.call.line] || '#888';
      if (b.waitFrom != null && !dragging) {
        const wx = X(Math.max(b.waitFrom, t0));
        g.save(); g.beginPath(); g.rect(wx, y + 4, Math.max(0, x0 - wx), h - 8); g.clip();
        g.strokeStyle = col; g.globalAlpha = 0.5; g.lineWidth = 1.2;
        for (let k = wx - h; k < x0; k += 6) { g.beginPath(); g.moveTo(k, y + h); g.lineTo(k + h, y); g.stroke(); }
        g.restore();
      }
      const bad = dragging && SC.drag.errs.length;
      g.save();
      g.globalAlpha = dragging ? 0.85 : 1;
      roundRect(g, Math.max(left, x0), y, Math.min(x1, W - 4) - Math.max(left, x0), h, 7);
      g.fillStyle = b.call.state === 'gone' || b.call.state === 'departing' ? '#d9d3c8' : tint(col, b.call.state === 'working' ? 0.62 : 0.78);
      g.fill();
      if (b.call.state === 'working') {
        const tot = b.call.planned.d + b.call.plan.count(), dn = b.call.done.d + b.call.done.l;
        const px = X(app.simT || sim.t);
        g.save(); g.clip();
        g.fillStyle = col; g.globalAlpha = 0.9; g.fillRect(x0, y, Math.max(0, Math.min(px, x1) - x0), h);
        g.restore();
        b.progress = dn / Math.max(1, tot);
      }
      g.lineWidth = bad ? 2 : 1;
      g.strokeStyle = bad ? '#c65a3e' : dragging ? '#28304a' : 'rgba(40,48,74,0.18)';
      if (dragging) g.setLineDash([4, 3]);
      g.stroke(); g.setLineDash([]);
      g.restore();
      // Label: ship glyph, name, size.
      const lx = Math.max(left, x0) + 8, avail = Math.min(x1, W - 4) - lx - 6;
      if (avail > 30) {
        g.save(); g.beginPath(); g.rect(lx - 2, y, avail + 4, h); g.clip();
        const dark = b.call.state === 'working';
        g.fillStyle = dark ? '#fff' : '#28304a';
        shipGlyph(g, lx, y + h / 2, dark ? '#fff' : '#28304a');
        g.textAlign = 'left'; g.font = '650 11.5px Inter, system-ui, sans-serif';
        g.fillText(b.call.vessel.name.toUpperCase(), lx + 18, y + h / 2 + 4);
        const nw = g.measureText(b.call.vessel.name.toUpperCase()).width;
        g.font = '500 11px Inter, system-ui, sans-serif'; g.globalAlpha = 0.85;
        const moves = b.call.planned.d + b.call.plan.count();
        g.fillText(`│ ${fmt.int(b.call.vessel.teu)} TEU · ${fmt.int(moves)} moves`, lx + 26 + nw, y + h / 2 + 4);
        g.restore();
      }
      geo.bars.push({ b, x0, x1, y, h, berth });
    }
    // Now.
    const nx = X(app.simT || sim.t);
    g.strokeStyle = '#c65a3e'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(nx, top - 6); g.lineTo(nx, H - 2); g.stroke();
    const lbl = 'NOW ' + fmt.hm(app.simT || sim.t);
    g.font = '700 10.5px Inter, system-ui, sans-serif';
    const tw = g.measureText(lbl).width + 12;
    roundRect(g, nx - tw / 2, 1, tw, 16, 8); g.fillStyle = '#c65a3e'; g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(lbl, nx, 12.5);
    if (SC.flashT && performance.now() - SC.flashT < 1200) { g.strokeStyle = 'rgba(198,90,62,0.6)'; g.lineWidth = 3; g.strokeRect(1, 1, W - 2, H - 2); }
    const working = sim.calls.filter(c => c.state === 'working').length;
    $('#schedSub').textContent = `${working} alongside · ${sim.calls.filter(c => c.state === 'anchored').length} at anchor · drag a planned call to re-plan`;
  };
  function roundRect(g, x, y, w, h, r) { w = Math.max(0, w); r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function tint(hex, k) { const n = parseInt(hex.slice(1), 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255; const m = (c) => Math.round(c + (255 - c) * k); return `rgb(${m(r)},${m(gg)},${m(b)})`; }
  function shipGlyph(g, x, y, col) {
    g.save(); g.fillStyle = col; g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x + 13, y + 1); g.lineTo(x + 11, y + 5); g.lineTo(x + 2, y + 5); g.closePath(); g.fill();
    g.fillRect(x + 2, y - 3, 3, 4); g.fillRect(x + 6, y - 2, 6, 3); g.restore();
  }

  function hit(e) {
    if (!geo) return null;
    const r = $('#gantt').getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (const b of geo.bars) if (x >= b.x0 && x <= b.x1 && y >= b.y && y <= b.y + b.h) return { b, x, y };
    return { x, y };
  }
  SC.down = function (e) {
    const h = hit(e); if (!h || !h.b) return;
    const call = h.b.b.call;
    if (!(call.state === 'planned' || call.state === 'anchored')) { TL.UI.select('call', call, { fly: true }); return; }
    SC.drag = { call, x: h.x, y: h.y, berth: call.berth, dt: 0, errs: [] };
    $('#gantt').setPointerCapture(e.pointerId);
  };
  SC.move = function (e) {
    const h = hit(e); if (!h) return;
    const tip = $('#schedTip');
    if (SC.drag) {
      const d = SC.drag;
      d.dt = Math.round((geo.T(h.x) - geo.T(d.x)) / 900) * 900;
      d.berth = TL.clamp(Math.floor((h.y - geo.top) / geo.rowH), 0, L.BERTHS.length - 1);
      d.errs = app.sim.berthErrs(d.call, d.berth);
      const etb = d.call.etb + d.dt;
      tip.innerHTML = `<b>${d.call.vessel.name}</b> → ${L.BERTHS[d.berth].id}, berthing ${TL.DAYS[TL.UI.dateOf(etb).getUTCDay()]} ${fmt.hm(etb)}` + (d.errs.length ? `<br><span style="color:var(--out)">${d.errs.join('<br>')}</span>` : '<br><span class="muted">Release to re-plan; later calls on that berth move back if they would overlap.</span>');
      tip.style.display = 'block'; tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY - 70 + 'px';
      SC.draw();
      return;
    }
    if (h.b) {
      const c = h.b.b.call, sim = app.sim, w = sim.callWindow(c);
      const moves = c.planned.d + c.plan.count();
      tip.innerHTML = `<b>${c.vessel.name}</b> ${TL.UI.stateChip(c)}<br>${TL.Stow.LINES[c.line].name} · ${c.visit}<br>${L.BERTHS[c.berth].id} · ${dayHM(w.start)} → ${dayHM(w.end)}<br>${fmt.int(moves)} moves (${c.planned.d} off, ${c.plan.count()} on)` + (c.state === 'working' ? `<br>${c.cranes.length} cranes · ${(h.b.b.progress * 100 || 0).toFixed(0)}% done` : (c.state === 'planned' || c.state === 'anchored') ? '<br><span class="muted">Drag to change berth or time</span>' : '');
      tip.style.display = 'block'; tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY - 110 + 'px';
      $('#gantt').style.cursor = (c.state === 'planned' || c.state === 'anchored') ? 'grab' : 'pointer';
    } else { tip.style.display = 'none'; $('#gantt').style.cursor = ''; }
  };
  SC.up = function () {
    const d = SC.drag; if (!d) return;
    SC.drag = null; $('#schedTip').style.display = 'none';
    if (!d.dt && d.berth === d.call.berth) { TL.UI.select('call', d.call, { fly: true }); SC.draw(); return; }
    const r = app.sim.moveCall(d.call, d.berth, d.call.etb + d.dt);
    if (r.ok) TL.UI.toast('ok', `${d.call.vessel.name} → ${L.BERTHS[d.call.berth].id}`, `Berthing ${dayHM(d.call.etb)}.` + (r.pushed.length ? ` Pushed back: ${r.pushed.join(', ')}.` : '') + ' Its exports are staged near the old berth, so carriers will drive further.');
    else TL.UI.toast('red', 'Cannot re-plan', r.errs.join('; '), 7000);
    SC.draw();
  };
  function dayHM(t) { const d = TL.UI.dateOf(t); return `${TL.DAYS[d.getUTCDay()]} ${fmt.hm(t)}`; }
})(globalThis.TL = globalThis.TL || {});
