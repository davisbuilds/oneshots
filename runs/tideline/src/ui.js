// ui.js: the console around the diorama: top bar, rail, KPI cards, callouts
// anchored to equipment, camera control, picking, search and toasts.
'use strict';
(function (TL) {
  const $ = (s) => document.querySelector(s);
  const L = TL.Layout;
  const fmt = TL.fmt;
  const UI = TL.UI = {};
  let app;

  // ── Time ───────────────────────────────────────────────────────────────
  UI.dateOf = (t) => new Date(TL.EPOCH + t * 1000);
  UI.clock = (t) => { const d = UI.dateOf(t); return `${TL.DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${TL.MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

  // ── Toasts ─────────────────────────────────────────────────────────────
  UI.toast = function (kind, title, text, ms = 5200) {
    const el = document.createElement('div');
    el.className = 'toast card ' + (kind || '');
    const ic = kind === 'red' ? 'alert' : kind === 'ok' ? 'check' : kind === 'amber' ? 'alert' : 'info';
    const col = kind === 'red' ? 'var(--out)' : kind === 'ok' ? 'var(--ok)' : kind === 'amber' ? 'var(--near)' : 'var(--slate)';
    el.innerHTML = `<span style="color:${col}">${TL.icon(ic)}</span><div><b>${title}</b>${text ? `<span class="muted">${text}</span>` : ''}</div>`;
    $('#toasts').prepend(el);
    while ($('#toasts').children.length > 4) $('#toasts').lastChild.remove();
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 450); }, ms);
  };

  // ── Selection ──────────────────────────────────────────────────────────
  UI.select = function (kind, ref, opts = {}) {
    app.sel = { kind, ref };
    const tab = kind === 'call' ? 'vessel' : kind === 'block' ? 'yard' : kind === 'truck' || kind === 'gate' ? 'gate' : 'equipment';
    if (kind === 'call') app.vesselCall = ref;
    if (!opts.keepTab) TL.Panel.show(tab);
    if (opts.fly) UI.flyTo(kind, ref);
    TL.Panel.dirty = true;
  };
  UI.flyTo = function (kind, ref, zoom) {
    let x = 260, y = 120, z = zoom || 0.17;
    if (kind === 'call') { const v = ref.vessel; x = ref.xAP + v.hull.L / 2; y = 20; z = zoom || 0.2; }
    else if (kind === 'crane') { x = ref.x; y = 10; z = zoom || 0.11; }
    else if (kind === 'sc' && ref._draw) { x = ref._draw.x; y = ref._draw.y; z = zoom || 0.08; }
    else if (kind === 'truck' && ref._draw) { x = ref._draw.x; y = ref._draw.y; z = zoom || 0.09; }
    else if (kind === 'block') { x = (ref.x0 + ref.x1) / 2; y = (ref.y0 + ref.y1) / 2; z = zoom || 0.16; }
    else if (kind === 'gate') { x = L.GATE.x - 40; y = 380; z = zoom || 0.16; }
    UI.camTo(x, y, z, 1.2);
  };
  UI.camTo = function (x, y, zoom, dur = 1) {
    const c = app.r.cam;
    app.camAnim = { from: { x: c.x, y: c.y, zoom: c.zoom }, to: { x, y, zoom }, t0: performance.now(), dur: dur * 1000 };
  };

  // ── Build the shell ────────────────────────────────────────────────────
  UI.init = function (a) {
    app = a;
    TL.iconize();
    TL.drawLogo($('#logo'));
    // Rail.
    const rail = [['home', 'Overview', 'overview'], ['ship', 'Vessels', 'vessels'], ['yard', 'Yard', 'yard'], ['crane', 'Equipment', 'equipment'], ['gate', 'Gate', 'gate'], ['calendar', 'Schedule', 'schedule']];
    $('#rail').innerHTML = rail.map(([i, l, k]) => `<button data-k="${k}" class="${k === 'overview' ? 'on' : ''}">${TL.icon(i)}${l}</button>`).join('') +
      `<div class="grow"></div><button data-k="demo">${TL.icon('film')}Demo</button><button data-k="help">${TL.icon('help')}Help</button>`;
    $('#rail').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const k = b.dataset.k;
      if (k !== 'demo' && k !== 'help') { for (const x of $('#rail').querySelectorAll('button')) x.classList.toggle('on', x === b); }
      UI.nav(k);
    });
    // Speed.
    const speeds = [[0, TL.icon('pause')], [1, '1×'], [20, '20×'], [60, '60×'], [180, '180×']];
    $('#speed').innerHTML = speeds.map(([s, l]) => `<button data-s="${s}" title="${s ? s + '× real time' : 'Pause'}">${l}</button>`).join('');
    $('#speed').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) UI.setSpeed(+b.dataset.s); });
    UI.setSpeed(app.speed);
    // KPI cards.
    $('#kpis').innerHTML = `
      <div class="kpi card" data-k="vessels"><div class="ic">${TL.icon('ship')}</div><div><div class="t">Vessels at berth</div><div class="v" id="kV"></div></div><span class="chev">${TL.icon('chev')}</span><div class="c" id="kVc"></div></div>
      <div class="kpi card" data-k="equipment"><div class="ic">${TL.icon('crane')}</div><div><div class="t">Crane productivity</div><div class="v" id="kC"></div></div><span class="chev">${TL.icon('chev')}</span><div class="c" id="kCc"></div><canvas class="spark" id="kCs" width="300" height="44"></canvas></div>
      <div class="kpi card" data-k="yard"><div class="ic">${TL.icon('yard')}</div><div><div class="t">Yard occupancy</div><div class="v" id="kY"></div></div><span class="chev">${TL.icon('chev')}</span><div class="bar"><i id="kYb"></i></div><div class="c" id="kYc"></div></div>
      <div class="kpi card" data-k="gate"><div class="ic">${TL.icon('truck')}</div><div><div class="t">Truck turn time</div><div class="v" id="kG"></div></div><span class="chev">${TL.icon('chev')}</span><div class="c" id="kGc"></div></div>`;
    $('#kpis').addEventListener('click', (e) => { const k = e.target.closest('.kpi'); if (k) UI.nav(k.dataset.k); });
    TL.Panel.init(app);
    TL.Schedule.init(app);
    UI.initInput();
    UI.initSearch();
    $('#demoStop').addEventListener('click', () => TL.Demo.stop());
    app.sel = null;
    UI.select('call', app.sim.calls[0], {});
    app.seenAlerts = app.sim.alerts.length;
  };

  UI.setSpeed = function (s) {
    if (s === 0) app.paused = true; else { app.paused = false; app.speed = s; }
    for (const b of $('#speed').children) b.classList.toggle('on', +b.dataset.s === (app.paused ? 0 : app.speed));
    $('#live').classList.toggle('paused', app.paused);
    $('#live').lastChild.textContent = app.paused ? 'Paused' : 'Live';
  };

  UI.nav = function (k) {
    const sim = app.sim;
    if (k === 'overview') { UI.camTo(250, 70, 0.27, 1.2); TL.Panel.show('vessel'); }
    else if (k === 'vessels') {
      const working = sim.calls.filter(c => c.state === 'working' || c.state === 'approach');
      const i = (working.indexOf(app.vesselCall) + 1) % working.length;
      UI.select('call', working[i] || sim.calls[0], { fly: true });
    } else if (k === 'yard') { TL.Panel.show('yard'); UI.camTo(420, 200, 0.3, 1.2); }
    else if (k === 'equipment') { TL.Panel.show('equipment'); }
    else if (k === 'gate') { UI.select('gate', null, { fly: true }); }
    else if (k === 'schedule') { TL.Schedule.flash(); UI.toast('', 'Berth schedule', 'Drag a planned call along the time axis or to another berth. Calls already alongside are fixed.'); }
    else if (k === 'demo') TL.Demo.start();
    else if (k === 'help') UI.toast('', 'Controls', 'Drag to pan, scroll to zoom, click equipment for details. Space pauses; 1-4 set the speed; D plays the demo tour. On the stowage plan, drag an outlined (planned) box to another slot.', 9000);
  };

  // ── Camera input and picking ───────────────────────────────────────────
  UI.initInput = function () {
    const cv = $('#view');
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      if (TL.Demo.on) TL.Demo.stop();
      drag = { x: e.clientX, y: e.clientY, moved: false, g: app.r.groundAt(e.clientX, e.clientY) };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) { UI.hover(e.clientX, e.clientY); return; }
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) { drag.moved = true; cv.classList.add('dragging'); }
      if (drag.moved) {
        const g = app.r.groundAt(e.clientX, e.clientY);
        app.r.cam.x += drag.g[0] - g[0]; app.r.cam.y += drag.g[1] - g[1];
        app.camAnim = null;
        UI.clampCam();
      }
    });
    cv.addEventListener('pointerup', (e) => {
      cv.classList.remove('dragging');
      if (drag && !drag.moved) UI.click(e.clientX, e.clientY);
      drag = null;
    });
    cv.addEventListener('pointercancel', () => { cv.classList.remove('dragging'); drag = null; });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (TL.Demo.on) TL.Demo.stop();
      const before = app.r.groundAt(e.clientX, e.clientY);
      const c = app.r.cam;
      c.zoom = TL.clamp(c.zoom * Math.exp(e.deltaY * 0.0015), 0.035, 1.1);
      app.r.matrices();
      const after = app.r.groundAt(e.clientX, e.clientY);
      c.x += before[0] - after[0]; c.y += before[1] - after[1];
      app.camAnim = null;
      UI.clampCam();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') { if (e.key === 'Escape') e.target.blur(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#q').focus(); return; }
      if (e.key === ' ') { e.preventDefault(); UI.setSpeed(app.paused ? app.speed : 0); }
      else if (e.key >= '1' && e.key <= '4') UI.setSpeed([1, 20, 60, 180][+e.key - 1]);
      else if (e.key.toLowerCase() === 'd') TL.Demo.on ? TL.Demo.stop() : TL.Demo.start();
      else if (e.key === 'Escape' && TL.Demo.on) TL.Demo.stop();
    });
  };
  UI.clampCam = function () {
    const c = app.r.cam;
    c.x = TL.clamp(c.x, -150, 1050); c.y = TL.clamp(c.y, -260, 470);
  };
  // What is under a screen point?
  UI.pick = function (px, py) {
    const sim = app.sim, r = app.r;
    let best = null, bd = 26;
    const near = (kind, ref, x, y, z, rad) => {
      const p = r.project(x, y, z);
      const d = Math.hypot(p[0] - px, p[1] - py);
      if (d < (rad || bd) && (!best || d < best.d)) best = { kind, ref, d };
    };
    for (const sc of sim.scs) if (sc._draw) near('sc', sc, sc._draw.x, sc._draw.y, 9, 22);
    for (const tr of sim.trucks) if (tr._draw && tr.state !== 'gone') near('truck', tr, tr._draw.x, tr._draw.y, 2.5, 18);
    for (const c of sim.cranes) if (c._draw) { near('crane', c, c.x, 19, 30, 40); near('crane', c, c.x, 19, 46, 40); near('crane', c, c.x, c._draw.y, 46, 30); }
    if (best) return best;
    // Ships: the deck plane.
    for (const call of sim.calls) {
      if (!call._matrix || call.state === 'gone' || call.state === 'planned') continue;
      const v = call.vessel, p = call._matrix.pose;
      const g = r.groundAt(px, py, TL.SIM.WL + v.hull.D - p.T + 4);
      const s = TL.Sim.worldToShip(p, g[0], g[1]), lx = s.x, ly = s.y;
      if (lx > v.hull.xAft && lx < v.hull.xFwd && Math.abs(ly) < v.hull.B / 2 + 2 && !p.hidden) return { kind: 'call', ref: call };
    }
    const g = r.groundAt(px, py, 0);
    for (const B of L.BLOCKS) if (g[0] > B.x0 && g[0] < B.x1 && g[1] > B.y0 && g[1] < B.y1) return { kind: 'block', ref: B };
    if (Math.abs(g[0] - L.GATE.x) < 60 && g[1] > 380 && g[1] < 440) return { kind: 'gate', ref: null };
    return null;
  };
  UI.click = function (px, py) {
    const p = UI.pick(px, py);
    if (p) UI.select(p.kind, p.ref);
  };
  UI.hover = function (px, py) {
    const p = UI.pick(px, py);
    $('#view').style.cursor = p ? 'pointer' : '';
  };

  // ── Search ─────────────────────────────────────────────────────────────
  UI.initSearch = function () {
    const q = $('#q'), res = $('#results');
    let items = [], hi = 0;
    const run = () => {
      const s = q.value.trim().toLowerCase();
      const sim = app.sim;
      items = [];
      if (s.length) {
        for (const c of sim.calls) if (c.vessel.name.toLowerCase().includes(s) || c.visit.toLowerCase().includes(s)) items.push({ icon: 'ship', label: c.vessel.name, sub: `${c.visit} · ${stateLabel(c)}`, go: () => UI.select('call', c, { fly: true }) });
        for (const c of sim.cranes) if (c.id.toLowerCase().includes(s)) items.push({ icon: 'crane', label: c.id, sub: c.status, go: () => UI.select('crane', c, { fly: true }) });
        for (const sc of sim.scs) if (sc.id.toLowerCase().includes(s)) items.push({ icon: 'straddle', label: sc.id, sub: sc.status, go: () => UI.select('sc', sc, { fly: true }) });
        for (const tr of sim.trucks) if (tr.state !== 'gone' && tr.id.toLowerCase().includes(s)) items.push({ icon: 'truck', label: tr.id, sub: tr.status, go: () => UI.select('truck', tr, { fly: true }) });
        for (const B of L.BLOCKS) if (('block ' + B.name).toLowerCase().includes(s)) items.push({ icon: 'yard', label: 'Block ' + B.name, sub: '', go: () => UI.select('block', B, { fly: true }) });
        if (s.length >= 4) {
          const found = UI.findBox(s);
          if (found) items.push({ icon: 'box', label: found.box.id, sub: found.where, go: found.go });
        }
      }
      items = items.slice(0, 7); hi = 0;
      res.innerHTML = items.map((it, i) => `<button class="${i === hi ? 'hi' : ''}" data-i="${i}">${TL.icon(it.icon)}<span>${it.label}</span><small>${it.sub}</small></button>`).join('') || (s ? '<div class="muted" style="padding:8px 10px">No matches</div>' : '');
      res.classList.toggle('open', !!s);
    };
    q.addEventListener('input', run);
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && items[hi]) { items[hi].go(); q.value = ''; run(); q.blur(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { hi = TL.clamp(hi + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1); [...res.children].forEach((b, i) => b.classList.toggle('hi', i === hi)); e.preventDefault(); }
    });
    res.addEventListener('mousedown', (e) => { const b = e.target.closest('button'); if (b) { items[+b.dataset.i].go(); q.value = ''; run(); q.blur(); } });
    q.addEventListener('blur', () => setTimeout(() => res.classList.remove('open'), 150));
  };
  UI.findBox = function (s) {
    const sim = app.sim; s = s.toUpperCase().replace(/\s/g, '');
    for (const st of sim.yard.stacks) for (const b of st.boxes) if (b.id.includes(s)) return { box: b, where: `Block ${st.block.name}, tier ${st.boxes.indexOf(b) + 1}`, go: () => UI.select('block', st.block, { fly: true }) };
    for (const c of sim.calls) for (const st of c.vessel.stacks) for (const b of st.boxes) if (b.id.includes(s)) return { box: b, where: `${c.vessel.name} ${c.vessel.brt(st.id, st.boxes.indexOf(b))}`, go: () => { UI.select('call', c, { fly: true }); TL.Panel.bay = st.bay; } };
    return null;
  };

  function stateLabel(c) {
    return { working: 'At berth', approach: 'Approaching', anchored: 'At anchor', planned: 'Planned', departing: 'Sailing', gone: 'Sailed' }[c.state];
  }
  UI.stateLabel = stateLabel;
  UI.stateChip = (c) => {
    const cls = { working: '', approach: 'blue', anchored: 'amber', planned: 'grey', departing: 'blue', gone: 'grey' }[c.state];
    return `<span class="chip ${cls}">${stateLabel(c)}</span>`;
  };

  // ── Per-frame update ───────────────────────────────────────────────────
  let lastKpi = 0, lastSched = 0;
  UI.update = function (a, t) {
    const now = performance.now();
    // Camera animation and the free viewport (between the panels).
    if (app.camAnim) {
      const A = app.camAnim, u = TL.clamp((now - A.t0) / A.dur, 0, 1), e = TL.easeInOut(u);
      const c = app.r.cam;
      // Zoom moves in log space so a fly-in feels even.
      c.x = TL.lerp(A.from.x, A.to.x, e); c.y = TL.lerp(A.from.y, A.to.y, e);
      c.zoom = Math.exp(TL.lerp(Math.log(A.from.zoom), Math.log(A.to.zoom), e));
      if (u >= 1) app.camAnim = null;
    }
    UI.frameShift();
    const d = UI.dateOf(t);
    $('#clock').innerHTML = `<span>${UI.clock(t)}</span>${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    if (now - lastKpi > 400 || app.still) { lastKpi = now; UI.kpis(); UI.alerts(); }
    if (now - lastSched > 250 || app.still) { lastSched = now; TL.Schedule.draw(); }
    TL.Panel.update(t);
    UI.callouts(t);
  };
  UI.frameShift = function () {
    const W = innerWidth, H = innerHeight;
    const left = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rail')) + 22;
    const right = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel')) + 22;
    const kb = document.getElementById('kpis').getBoundingClientRect().bottom;
    const top = 150, bottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sched')) + 22;
    // Callouts live below the KPI cards and above the schedule.
    app.free = { x0: left, x1: W - right, y0: kb - 4, y1: H - bottom };
    if (document.body.classList.contains('bare') || document.body.classList.contains('cine')) { app.free = { x0: 0, x1: W, y0: 0, y1: H }; app.r.cam.shiftX = 0; app.r.cam.shiftY = 0; return; }
    app.r.cam.shiftX = (left + (W - right)) / 2 - W / 2;
    app.r.cam.shiftY = -(((top + (H - bottom)) / 2) - H / 2);
  };

  UI.kpis = function () {
    const sim = app.sim, k = sim.kpi();
    $('#kV').innerHTML = `${k.atBerth}<small>/ ${k.berths}</small>`;
    $('#kVc').textContent = [k.arriving ? `${k.arriving} arriving` : null, k.anchored ? `${k.anchored} at anchor` : null, `${sim.calls.filter(c => c.state === 'planned').length} planned`].filter(Boolean).join(' · ');
    const mph = k.mph, prev = k.mphPrev;
    $('#kC').innerHTML = `${mph ? mph.toFixed(1) : '—'}<small>moves/hr</small>`;
    const dlt = prev > 1 ? (mph - prev) / prev * 100 : 0;
    $('#kCc').innerHTML = prev > 1 ? `<span class="delta ${dlt >= 0 ? 'up' : 'down'}">${dlt >= 0 ? '▲' : '▼'} ${Math.abs(dlt).toFixed(0)}%</span> vs previous hour · ${k.cranesWorking} cranes` : `gross, last 60 min · ${k.cranesWorking} cranes`;
    // Sparkline: moves per crane-hour in 10-minute bins over three hours.
    const cv = $('#kCs'), g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    const bins = new Array(18).fill(0);
    for (const m of sim.stats.moves) { const b = Math.floor((sim.t - m.t) / 600); if (b >= 0 && b < 18) bins[17 - b]++; }
    const vals = bins.map(n => n * 6 / Math.max(1, k.cranesWorking));
    const mx = Math.max(40, ...vals);
    g.beginPath();
    vals.forEach((v, i) => { const x = 2 + i * (cv.width - 4) / 17, y = cv.height - 4 - v / mx * (cv.height - 10); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = '#c65a3e'; g.lineWidth = 2.5; g.lineJoin = 'round'; g.stroke();
    g.lineTo(cv.width - 2, cv.height); g.lineTo(2, cv.height); g.closePath();
    g.fillStyle = 'rgba(198,90,62,0.10)'; g.fill();
    const occ = k.yardTEU / k.yardCap * 100;
    $('#kY').innerHTML = `${occ.toFixed(0)}<small>%</small>`;
    $('#kYb').style.width = occ.toFixed(1) + '%';
    $('#kYc').textContent = `${fmt.int(k.yardTEU)} / ${fmt.int(k.yardCap)} TEU · ${k.rehandles} rehandles`;
    $('#kG').innerHTML = k.turn != null ? `${(k.turn / 60).toFixed(0)}<small>min</small>` : '—';
    $('#kGc').textContent = `${k.queue} queuing at the gate · ${k.inside} inside`;
  };
  UI.alerts = function () {
    const sim = app.sim;
    const n = sim.log.length;
    if (app.seenLog == null) app.seenLog = n;
    for (let i = app.seenLog; i < n; i++) {
      const a = sim.log[i];
      if (a.kind === 'hold') UI.toast('amber', 'Stability hold', a.text);
      else if (a.kind === 'violation') UI.toast('red', 'Out of limits', a.text);
      else if (a.kind === 'berth') UI.toast('ok', 'Berthed', a.text);
      else if (a.kind === 'sail') UI.toast('ok', 'Vessel complete', a.text);
    }
    app.seenLog = n;
  };

  // ── Callouts anchored to equipment ─────────────────────────────────────
  const pins = new Map();
  function el(key, cls) {
    let e = pins.get(key);
    if (!e) {
      e = document.createElement('div'); e.className = cls; $('#callouts').appendChild(e); pins.set(key, e);
      e.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      e.addEventListener('click', () => e._onclick && e._onclick());
    }
    e._seen = true;
    return e;
  }
  const inFree = (p, m = 10) => p[0] > app.free.x0 + m && p[0] < app.free.x1 - m && p[1] > app.free.y0 + m && p[1] < app.free.y1 - m;
  UI.callouts = function (t) {
    const sim = app.sim, r = app.r;
    for (const e of pins.values()) e._seen = false;
    const lines = [];
    const sel = app.sel || {};
    if (!app.hideCallouts) {
      // Cranes: a pin each, or a card when selected.
      for (const c of sim.cranes) {
        if (!c._draw) continue;
        const p = r.project(c._draw.x, 19, 78);
        if (!inFree(p, 30)) continue;
        const mph = c.moves.filter(m => m > sim.t - 3600).length;
        if (sel.kind === 'crane' && sel.ref === c) {
          const e = el('crane:card:' + c.k, 'call card');
          const chip = c.status === 'Stability hold' ? 'red' : /Wait/.test(c.status) ? 'amber' : c.status === 'Idle' || c.status === 'Finished' ? 'grey' : '';
          const ctx = c.call ? `${c.call.vessel.name}${c.bay >= 0 ? ' · bay ' + String(c.call.vessel.bays[c.bay].no).padStart(2, '0') : ''}` : 'Unassigned';
          e.innerHTML = `<div class="ic">${TL.icon('crane')}</div><div><b>Crane ${c.id}</b> <span class="chip ${chip}">${c.status}</span></div><span class="chev">${TL.icon('chev')}</span><div class="l2">${mph} moves/hr</div><div class="l3">${ctx}</div>`;
          const w = 250, x = p[0] - w - 40, y = p[1] - 30;
          e.style.left = x + 'px'; e.style.top = y + 'px';
          lines.push([x + w, y + 30, p[0], p[1] + 20]);
          e._onclick = () => TL.Panel.show('equipment');
        } else {
          const e = el('crane:' + c.k, 'pin' + (c.status === 'Stability hold' ? ' warn' : ''));
          e.innerHTML = `<span class="pi">${TL.icon('crane')}</span>${c.id}<small>${c.call && c.call.state === 'working' ? mph + ' /hr' : c.status}</small>`;
          e.style.left = p[0] + 'px'; e.style.top = p[1] + 'px';
          e._onclick = () => UI.select('crane', c);
        }
      }
      // The selected vessel.
      const call = app.vesselCall;
      if (call && call._matrix && call.state !== 'gone' && call.state !== 'planned') {
        const v = call.vessel, P = call._matrix.pose;
        const a = TL.Sim.shipToWorld(P, v.hull.L * 0.62, 0, v.hull.D + 12, {});
        const p = r.project(a.x, a.y, a.z);
        if (inFree(p, 0)) {
          const e = el('vessel', 'call card');
          const c = sim.condition(call);
          e.innerHTML = `<div class="ic">${TL.icon('pin')}</div><div><b>${v.name.toUpperCase()}</b></div><span class="chev">${TL.icon('chev')}</span><div class="l3">LOA ${v.hull.LOA.toFixed(0)} m · ${fmt.int(v.teu)} TEU · draft ${c.maxDraft.toFixed(1)} m</div><div class="l3" style="margin-top:4px">${UI.stateChip(call)} <span class="muted">&nbsp;${L.BERTHS[call.berth].id}</span></div>`;
          const x = TL.clamp(p[0] - 110, app.free.x0 + 8, app.free.x1 - 240), y = TL.clamp(p[1] + 60, app.free.y0 + 120, app.free.y1 - 90);
          e.style.left = x + 'px'; e.style.top = y + 'px';
          lines.push([x + 100, y, p[0], p[1]]);
          e._onclick = () => UI.select('call', call);
        }
      }
      // One straddle carrier waiting under a crane (or the selected one).
      let sc = sel.kind === 'sc' ? sel.ref : null;
      if (!sc) {
        let best = 1e9;
        for (const s of sim.scs) {
          const tk = s.task;
          if (!tk || tk.kind !== 'disch' || !(t >= tk.pickT0 && t < tk.attachT) || !s._draw) continue;
          const p = r.project(s._draw.x, s._draw.y, 8);
          const d = Math.hypot(p[0] - (app.free.x0 + app.free.x1) / 2, p[1] - (app.free.y0 + app.free.y1) / 2);
          if (inFree(p, 60) && d < best) { best = d; sc = s; }
        }
        if (sc && app.lastSc && app.lastSc !== sc && app.lastSc.task && app.lastSc.task.kind === 'disch' && t < app.lastSc.task.attachT) sc = app.lastSc;
        app.lastSc = sc;
      }
      if (sc && sc._draw) {
        const p = r.project(sc._draw.x, sc._draw.y, 8);
        if (inFree(p, 20)) {
          const e = el('sc', 'call card keep');
          const tk = sc.task;
          const waiting = tk && t >= tk.pickT0 && t < tk.attachT;
          const status = !tk ? sc.status : waiting ? 'In position' : t < tk.pickT0 ? 'To ' + tk.pickLabel : 'To ' + tk.dropLabel;
          const sub = !tk ? 'No job' : waiting ? (tk.kind === 'disch' ? 'Waiting for lift' : 'Lifting') : `${tk.box.id.slice(0, 4)} ${tk.box.id.slice(4, 10)} · ${TL.Stow.TYPES[tk.box.type].label}`;
          e.innerHTML = `<div class="ic">${TL.icon('straddle')}</div><div><b>${sc.id}</b></div><span class="chev">${TL.icon('chev')}</span><div class="l3"><span class="chip ${waiting ? '' : 'blue'}">${status}</span></div><div class="l3" style="margin-top:3px">${sub}</div>`;
          const x = TL.clamp(p[0] + 60, app.free.x0 + 8, app.free.x1 - 220), y = TL.clamp(p[1] - 10, app.free.y0 + 120, app.free.y1 - 80);
          e.style.left = x + 'px'; e.style.top = y + 'px';
          lines.push([x, y + 26, p[0], p[1]]);
          e._onclick = () => UI.select('sc', sc);
        }
      }
      // A truck: the selected one, or the next one at the gate.
      let tr = sel.kind === 'truck' ? sel.ref : sim.trucks.find(x => x.state === 'inbound' && x._draw);
      if (tr && tr._draw && tr.state !== 'gone') {
        const p = r.project(tr._draw.x, tr._draw.y, 4);
        if (inFree(p, 20)) {
          const e = el('truck', 'call card');
          const eta = tr.state === 'inbound' ? Math.max(0, tr.dockT - t) : null;
          const what = tr.kind === 'delivery' ? `Export · 1 × ${tr.box ? TL.Stow.TYPES[tr.box.type].label : "40'"}` : `Import pickup · ${tr.target ? TL.Stow.TYPES[tr.target.type].label : "40'"}`;
          e.innerHTML = `<div class="ic">${TL.icon('truck')}</div><div><b>Truck ${tr.id}</b></div><span class="chev">${TL.icon('chev')}</span><div class="l3"><span class="chip ${tr.state === 'docked' ? 'amber' : ''}">${eta != null ? 'ETA ' + Math.max(1, Math.round(eta / 60)) + ' min to ' + L.BAYS[tr.bay].id : tr.status}</span></div><div class="l3" style="margin-top:3px">${what}</div>`;
          const x = TL.clamp(p[0] - 260, app.free.x0 + 8, app.free.x1 - 230), y = TL.clamp(p[1] - 90, app.free.y0 + 120, app.free.y1 - 80);
          e.style.left = x + 'px'; e.style.top = y + 'px';
          lines.push([x + 230, y + 40, p[0], p[1]]);
          e._onclick = () => UI.select('truck', tr);
        }
      }
      // A re-planned box: where it waits in the yard, then on its way.
      const rp = app.ripple;
      if (rp && performance.now() < rp.until) {
        const b = rp.box, loc = b.loc || {};
        let w = null, txt = '';
        if (loc.kind === 'yard') { const st = sim.yard.byKey.get(loc.key); if (st) { w = [st.x, st.y, (loc.idx + 1) * b.h + 1]; txt = `waiting in block ${st.block.name}, tier ${loc.idx + 1}`; } }
        else if (loc.kind === 'sc') { const c = sim.scs[loc.sc]; if (c._draw) { w = [c._draw.x, c._draw.y, 14]; txt = `on ${c.id}, to the crane`; } }
        else if (loc.kind === 'ground') { const st = sim.scG.states[loc.state]; w = [st.x, st.y, 4]; txt = `under ${sim.cranes[loc.crane].id}`; }
        else if (loc.kind === 'crane') { const c = sim.cranes[loc.crane]; w = [c._draw.x, c._draw.y, c._draw.z]; txt = `on ${c.id}'s spreader`; }
        else if (loc.kind === 'ship') { rp.until = Math.min(rp.until, performance.now() + 3000); txt = 'loaded'; }
        if (w) {
          const p = r.project(w[0], w[1], w[2]);
          if (inFree(p, 10)) {
            const e = el('ripple', 'call card keep');
            e.innerHTML = `<div class="ic" style="color:var(--teal)">${TL.icon('box')}</div><div><b>${b.id.slice(0, 4)} ${b.id.slice(4)}</b></div><span class="chev">${TL.icon('chev')}</span><div class="l3"><span class="chip blue">Re-planned to ${rp.slot}</span></div><div class="l3" style="margin-top:3px">${txt}</div>`;
            const x = TL.clamp(p[0] + 50, app.free.x0 + 8, app.free.x1 - 240), y = TL.clamp(p[1] - 100, app.free.y0 + 8, app.free.y1 - 90);
            e.style.left = x + 'px'; e.style.top = y + 'px';
            lines.push([x, y + 30, p[0], p[1]]);
            e._onclick = () => UI.select('call', rp.call);
          }
        }
      }
      // Gate and yard block pins.
      {
        const p = r.project(L.GATE.x, 409, 14);
        if (inFree(p, 30)) {
          const e = el('gate', 'pin teal');
          e.innerHTML = `<span class="pi">${TL.icon('gate')}</span>Gate<small>${sim.queue.length} queuing</small>`;
          e.style.left = p[0] + 'px'; e.style.top = p[1] + 'px';
          e._onclick = () => UI.select('gate', null);
        }
      }
      const B = sel.kind === 'block' ? sel.ref : null;
      for (const blk of L.BLOCKS) {
        if (blk !== B && !(blk.name === 'C1' || blk.name === 'E2')) continue;
        const p = r.project((blk.x0 + blk.x1) / 2, (blk.y0 + blk.y1) / 2, 12);
        if (!inFree(p, 40)) continue;
        const st = sim.yard.stacks.filter(s => s.block === blk);
        const occ = st.reduce((n, s) => n + s.boxes.length, 0) / (st.length * L.SLOT_TIERS) * 100;
        const e = el('block:' + blk.name, 'pin' + (blk === B ? ' teal' : ''));
        e.innerHTML = `<span class="pi">${TL.icon('yard')}</span>Block ${blk.name}<small>${occ.toFixed(0)}%</small>`;
        e.style.left = p[0] + 'px'; e.style.top = p[1] + 'px';
        e._onclick = () => UI.select('block', blk);
      }
    }
    for (const [k, e] of pins) if (!e._seen) { e.remove(); pins.delete(k); }
    $('#leaders').innerHTML = lines.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fbf7f0" stroke-width="3" stroke-opacity=".9"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#28304a" stroke-width="1.2" stroke-opacity=".7"/><circle cx="${x2}" cy="${y2}" r="4.5" fill="#fbf7f0" stroke="#28304a" stroke-width="1.6"/>`).join('');
  };
})(globalThis.TL = globalThis.TL || {});
