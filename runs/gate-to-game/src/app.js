// app.js: the page. Runs the game on the gate-level CPU, and the zoom.
'use strict';
(function (G) {
  const $ = id => document.getElementById(id);
  const { MAP } = G.isa;
  const { hex4, commas } = G.scene;
  // CPU cycles per 60 Hz video frame: 2,000 is a 120 kHz clock. A slow device
  // gets fewer (the game needs a few hundred in a typical frame); the page
  // shows the clock it actually achieves.
  const MAX_PER_TICK = 2000, MIN_PER_TICK = 500, SIM_BUDGET_MS = 7;

  // ?clean hides the panels; ?film also replaces the clock, so a headless
  // script can render the tour frame by frame (tools/film.mjs).
  const params = new URLSearchParams(location.search);
  const FILM = params.has('film'), CLEAN = FILM || params.has('clean');
  let filmNow = 0;
  const clock = () => FILM ? filmNow : performance.now();
  if (FILM) document.body.classList.add('film');
  else if (CLEAN) document.body.classList.add('clean');

  // ---- Build the computer -------------------------------------------------
  const t0 = performance.now();
  const compiled = G.tin.compile(G.gameSource);
  const nl = G.machine.netlist();
  const machine = new G.machine.Machine(compiled.rom, { netlist: nl });
  const probe = new G.machine.Probe(nl);
  const board = machine.board;
  board.chains = new Map();
  board.onScreen = (p, pc) => board.chains.set(p, G.trace.callChain(compiled, board.ram, pc));
  const buildMs = performance.now() - t0;

  // The screen as a 64 x 48 canvas, scaled up without smoothing when drawn.
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = MAP.WIDTH; screenCanvas.height = MAP.HEIGHT;
  const sctx = screenCanvas.getContext('2d');
  const img = sctx.createImageData(MAP.WIDTH, MAP.HEIGHT);
  const pal = G.machine.PALETTE.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
  function paintScreen() {
    if (!board.dirty) return;
    board.dirty = false;
    const d = img.data, s = board.screen;
    for (let i = 0; i < s.length; i++) { const c = pal[s[i] & 15]; d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; }
    sctx.putImageData(img, 0, 0);
  }

  const canvas = $('view');
  const env = { machine, compiled, nl, screenCanvas, sourceLines: G.gameSource.split('\n'), asmLines: compiled.program.lines,
    still: matchMedia('(prefers-reduced-motion: reduce)').matches };
  const scene = new G.scene.Scene(canvas, env);

  // ---- State ---------------------------------------------------------------
  const st = {
    paused: false, follow: true, selPixel: -1, targetZ: 0, tour: null, keys: 0, touchKeys: 0,
    ticks: 0, tickStart: clock(), cyclesWindow: [], blend: null, renderMs: 0, perTick: MAX_PER_TICK,
  };

  function ballPixel() {
    // The game draws the ball in colour 15; follow its most recent write.
    let best = -1, bestCycle = -1;
    const s = board.screen, c = board.log.cycle;
    for (let p = 0; p < s.length; p++) if (s[p] === 15 && c[p] > bestCycle) { best = p; bestCycle = c[p]; }
    return best;
  }

  function select(pixel, keepZ = true) {
    const sel = G.trace.select(machine, compiled, pixel, probe);
    st.selPixel = pixel;
    if (sel.record) scene.transistor = sel.transistor;
    scene.setSelection(sel, keepZ);
    st.targetZ = Math.min(st.targetZ, scene.zMax);
    buildRuler();
    if (st.slow) setSlow(true);
  }

  // Slow motion: replay the selected cycle one gate delay at a time.
  function setSlow(on) {
    const sel = scene.sel;
    st.slow = on && !!(sel && sel.record && sel.record.before);
    if (st.slow) {
      if (!sel.replay) sel.replay = G.trace.replay(nl, sel.before, sel.now);
      scene.replay = Object.assign(sel.replay, { t0: clock(), stepMs: 70, hold: 1400 });
    } else scene.replay = null;
    $('slow').setAttribute('aria-pressed', String(st.slow));
    $('slow').textContent = st.slow ? 'Stop slow motion' : 'Slow motion';
  }

  // Re-aim the path below the camera at another instance (or transistor).
  function retarget(inst, transistor) {
    const sel = scene.sel;
    let leaf = inst;
    if (inst.type !== 'Nand') {
      const within = g => { for (let i = nl.insts[nl.gInst[g]]; i; i = i.parent) if (i === inst) return true; return false; };
      let g = sel.chain.find(within);
      if (g === undefined) {
        // Any gate in it that flipped this cycle, else its first gate.
        const stack = [inst];
        while (stack.length && g === undefined) {
          const i = stack.shift();
          if (i.type === 'Nand') { if (sel.before[nl.gOut[i.gate]] !== sel.now[nl.gOut[i.gate]]) g = i.gate; }
          else stack.push(...i.children);
        }
        if (g === undefined) { let i = inst; while (i.children.length) i = i.children[0]; g = i.gate; }
      }
      leaf = nl.insts[nl.gInst[g]];
    }
    const before = scene.transform(scene.cur.k, scene.cur.f);
    const k = scene.cur.k;
    sel.path = G.trace.pathTo(nl, leaf);
    sel.gate = leaf.gate;
    scene.transistor = transistor || G.trace.pickTransistor(nl, leaf.gate, sel.before, sel.now);
    scene.setSelection(sel, true);
    st.blend = { k, from: before, t0: clock() };
    buildRuler();
  }

  // ---- Captions --------------------------------------------------------------
  function caption(k) {
    const l = scene.levels[k], sel = scene.sel;
    if (!l || !sel) return ['', ''];
    const nm = n => `<code>${n}</code>`;
    switch (l.kind) {
      case 'game': return ['BRICKFALL, on a computer made of NAND gates',
        `Every pixel is a word of memory, written by a program compiled for a CPU of ${commas(nl.nGates)} NAND gates, simulated gate by gate as you watch. ` +
        (st.follow ? 'The highlighted pixel is the ball. Scroll to zoom into it, or click any pixel.' : 'Scroll to zoom into the highlighted pixel, or click another.')];
      case 'pixel': return [`Pixel (${sel.x}, ${sel.y})`, sel.record
        ? `One 16-bit word at address ${nm(hex4(sel.address))}. Its value, ${sel.value}, is a colour. It was last written in cycle ${commas(sel.record.cycle)} by a single instruction. Time is stopped here.`
        : 'This word has never been written: it still holds the 0 the RAM powered up with. Pick a pixel the game has drawn.'];
      case 'program': {
        const line = (env.sourceLines[sel.srcLine - 1] || '').trim();
        return [`The instruction ${nm(G.asm.disassemble(sel.inst))} at ROM ${sel.pc}`,
          `Compiled from line ${sel.srcLine} of the game, ${nm(line.replace(/</g, '&lt;'))}, in ${nm(sel.func + '()')}. The assembler turned it into the 16-bit word on the right; the CPU executed it in cycle ${commas(sel.record.cycle)}.`];
      }
      case 'chip': {
        const i = l.inst, spec = G.hdl.CHIPS[i.type] || {};
        let gates = 0, flips = 0;
        const walk = x => { if (x.type === 'Nand') { gates++; if (sel.before[nl.gOut[x.gate]] !== sel.now[nl.gOut[x.gate]]) flips++; } else x.children.forEach(walk); };
        walk(i);
        if (!i.parent) return ['The G16 CPU, during that one cycle',
          `${commas(nl.nGates)} NAND gates. Amber wires carry a 1; pink ones changed since the previous cycle (${commas(flips)} gates flipped). writeM is ${sel.now[nl.outputs.writeM]}, so the RAM stores ${sel.value} at ${nm(hex4(sel.address))} when the clock rises.`];
        return [`${i.type} · ${i.label}`, `${spec.about || ''} ${commas(gates)} NAND gate${gates === 1 ? '' : 's'}; ${commas(flips)} flipped in this cycle.`];
      }
      case 'nand': {
        const g = l.inst.gate, a = sel.now[nl.gA[g]], b = sel.now[nl.gB[g]], o = sel.now[nl.gOut[g]], ob = sel.before[nl.gOut[g]];
        return ['One NAND gate', `Inputs ${a} and ${b}, output ${o}${ob !== o ? `, which was ${ob} one cycle earlier: this is the gate that flipped` : ''}. In silicon it is four transistors: two PMOS in parallel pull the output up, two NMOS in series pull it down.`];
      }
      case 'mosfet': {
        const t = scene.transistor, isP = t[0] === 'P';
        return [`One transistor: ${t}, ${isP ? 'PMOS' : 'NMOS'}`,
          `A switch made of silicon. ${isP ? 'A PMOS conducts when its gate is at 0 V' : 'An NMOS conducts when its gate is at the supply voltage'}: the gate's field gathers carriers into a thin channel under the oxide. This is the bottom of the stack.`];
      }
    }
    return [l.name, ''];
  }

  // ---- The depth ruler -------------------------------------------------------
  let rulerKey = '';
  function buildRuler() {
    const key = scene.levels.map(l => l.short + l.z.toFixed(4)).join();
    if (key === rulerKey) return;
    rulerKey = key;
    const r = $('ruler-ticks');
    r.textContent = '';
    const zmax = Math.max(scene.zMax, 1e-6);
    scene.levels.forEach((l, i) => {
      const b = document.createElement('button');
      b.className = 'tick';
      b.style.left = `${(l.z / zmax) * 100}%`;
      b.textContent = l.short;
      b.title = `Zoom to ${l.name}`;
      b.addEventListener('click', () => { stopTour(); st.targetZ = l.z; });
      r.appendChild(b);
    });
  }
  function updateRuler() {
    const zmax = Math.max(scene.zMax, 1e-6);
    $('ruler-mark').style.left = `${(scene.z / zmax) * 100}%`;
    const mag = Math.exp(scene.z);
    const e = Math.floor(Math.log10(mag));
    $('scale').innerHTML = mag < 1000 ? `×${mag < 10 ? mag.toFixed(1) : Math.round(mag)}` : `×${(mag / 10 ** e).toFixed(1)}·10<sup>${e}</sup>`;
    [...$('ruler-ticks').children].forEach((t, i) => t.classList.toggle('on', i === scene.cur.k));
  }

  // ---- Tour ----------------------------------------------------------------------
  function startTour() {
    if (st.follow) { const b = ballPixel(); if (b >= 0) select(b); }
    st.tour = { i: scene.z < 0.05 ? 1 : 0, phase: 'go', t0: clock(), from: scene.z };
    $('tour').textContent = 'Stop the tour';
  }
  function stopTour() {
    if (!st.tour) return;
    if (st.tour.slowed) setSlow(false);
    st.tour = null; $('tour').textContent = 'Take the tour';
  }
  function stepTour(now) {
    const T = st.tour;
    if (!T) return;
    const L = scene.levels;
    if (T.phase === 'go') {
      const to = T.back ? 0 : L[T.i].z;
      const dur = Math.max(1100, Math.abs(to - T.from) / (T.back ? 4.5 : 1.4) * 1000);
      const u = Math.min(1, (now - T.t0) / dur);
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      scene.z = st.targetZ = T.from + (to - T.from) * e;
      if (u >= 1) {
        T.phase = 'dwell'; T.t0 = now;
        // From the CPU down, show the cycle happening.
        if (!T.back && L[T.i].kind !== 'game' && L[T.i].kind !== 'pixel' && L[T.i].kind !== 'program' && !st.slow) { setSlow(true); T.slowed = true; }
      }
    } else if (now - T.t0 > (T.back ? 0 : T.i === L.length - 1 ? 6000 : 3200)) {
      if (T.back) { stopTour(); return; }
      if (T.i === L.length - 1) { T.back = true; T.phase = 'go'; T.t0 = now; T.from = scene.z; if (T.slowed) { setSlow(false); T.slowed = false; } return; }
      T.i++; T.phase = 'go'; T.t0 = now; T.from = scene.z;
    }
  }

  // ---- Input -----------------------------------------------------------------------
  const KEYMAP = { ArrowLeft: 1, a: 1, A: 1, ArrowRight: 2, d: 2, D: 2, ' ': 4, ArrowUp: 4, w: 4, W: 4 };
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (KEYMAP[e.key]) { st.keys |= KEYMAP[e.key]; e.preventDefault(); return; }
    if (e.key === '+' || e.key === '=' || e.key === 'PageDown') { stopTour(); zoomStep(1); e.preventDefault(); }
    if (e.key === '-' || e.key === '_' || e.key === 'PageUp') { stopTour(); zoomStep(-1); e.preventDefault(); }
    if (e.key === 'Home' || e.key === 'Escape') { stopTour(); st.targetZ = 0; }
    if (e.key === 't' || e.key === 'T') st.tour ? stopTour() : startTour();
    if (e.key === 'p' || e.key === 'P') togglePause();
    if (e.key === 's' || e.key === 'S') setSlow(!st.slow);
  });
  addEventListener('keyup', e => { if (KEYMAP[e.key]) st.keys &= ~KEYMAP[e.key]; });
  addEventListener('blur', () => { st.keys = 0; st.touchKeys = 0; });

  function zoomStep(dir) {
    const { k, f } = scene.cur;
    const L = scene.levels;
    if (dir > 0) st.targetZ = (L[k + 1] || L[k]).z;
    else st.targetZ = f > 0.05 ? L[k].z : (L[k - 1] || L[0]).z;
  }

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    stopTour();
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    st.targetZ = Math.min(scene.zMax, Math.max(0, st.targetZ - d * 0.0025));
  }, { passive: false });

  // Pointer: a tap selects; a vertical drag (or a pinch) zooms.
  const pts = new Map();
  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag = { x: e.clientX, y: e.clientY, z: st.targetZ, moved: false, pinch: pts.size === 2 ? dist() : 0 };
  });
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  canvas.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || !drag) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && drag.pinch) {
      stopTour();
      st.targetZ = Math.min(scene.zMax, Math.max(0, drag.z + Math.log(dist() / drag.pinch)));
      drag.moved = true;
    } else if (pts.size === 1) {
      const dy = e.clientY - drag.y;
      if (Math.abs(dy) > 8 || Math.abs(e.clientX - drag.x) > 8) drag.moved = true;
      if (drag.moved && e.pointerType !== 'mouse') { stopTour(); st.targetZ = Math.min(scene.zMax, Math.max(0, drag.z - dy * 0.012)); }
    }
  });
  const up = e => {
    pts.delete(e.pointerId);
    if (drag && !drag.moved && pts.size === 0) click(e.clientX, e.clientY);
    if (pts.size === 0) drag = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', e => { pts.delete(e.pointerId); drag = null; });

  function click(cx, cy) {
    const dpr = env.dpr;
    const x = cx * dpr, y = cy * dpr;
    // The game screen only takes clicks while it is the level in view.
    const hits = scene.hits.filter(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h && (h.kind !== 'screen' || scene.cur.k === 0));
    if (!hits.length) return;
    hits.sort((a, b) => a.w * a.h - b.w * b.h);
    const h = hits[0];
    stopTour();
    if (h.kind === 'screen') {
      const pw = h.w / 64;
      const px = Math.floor((x - h.x) / pw), py = Math.floor((y - h.y) / pw);
      if (px < 0 || px > 63 || py < 0 || py > 47) return;
      st.follow = false;
      $('follow').hidden = false;
      select(py * 64 + px);
      if (scene.z < 0.01) st.targetZ = 0;
    } else if (h.kind === 'zoom') {
      st.targetZ = scene.levels[h.level].z;
    } else if (h.kind === 'inst' && scene.sel.path) {
      retarget(h.inst);
      const L = scene.levels.findIndex(l => l.inst === h.inst);
      if (L >= 0) st.targetZ = scene.levels[L].z;
    } else if (h.kind === 'transistor' && scene.sel.path) {
      retarget(h.inst, h.name);
      st.targetZ = scene.levels[scene.levels.length - 1].z;
    }
  }

  // On-screen game buttons (phones).
  document.querySelectorAll('[data-key]').forEach(b => {
    const bit = +b.dataset.key;
    const on = e => { e.preventDefault(); st.touchKeys |= bit; b.classList.add('down'); };
    const off = () => { st.touchKeys &= ~bit; b.classList.remove('down'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
  });

  function togglePause() {
    st.paused = !st.paused;
    $('pause').textContent = st.paused ? 'Run' : 'Pause';
    $('pause').setAttribute('aria-pressed', String(st.paused));
  }
  $('pause').addEventListener('click', togglePause);
  $('tour').addEventListener('click', () => st.tour ? stopTour() : startTour());
  $('out').addEventListener('click', () => { stopTour(); st.targetZ = 0; });
  $('in').addEventListener('click', () => { stopTour(); zoomStep(1); });
  $('follow').addEventListener('click', () => { st.follow = true; $('follow').hidden = true; });
  $('slow').addEventListener('click', () => setSlow(!st.slow));

  // ---- Main loop ---------------------------------------------------------------------
  // The safe area is the part of the canvas no panel covers; frames are
  // fitted into it. Panels have fixed sizes, so it only changes on resize.
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    env.dpr = dpr;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    const W = innerWidth, ruler = $('ruler').getBoundingClientRect();
    let x0 = 8, y0 = 8, x1 = W - 8, y1 = ruler.top - 8;
    if (FILM) { x0 = 0; y0 = 0; x1 = W; }
    else if (CLEAN) { x0 = 0; y0 = 0; x1 = W; y1 = innerHeight; }
    else if (getComputedStyle($('side')).display !== 'contents') x0 = $('side').getBoundingClientRect().right + 12;
    else {
      y0 = Math.max(document.querySelector('header').getBoundingClientRect().bottom, $('stats').getBoundingClientRect().bottom) + 6;
      const b = $('bottom').getBoundingClientRect();
      if (b.left > W / 2) x1 = b.left - 8; else y1 = b.top - 6;
    }
    env.safe = { x: x0 * dpr, y: y0 * dpr, w: Math.max(50, x1 - x0) * dpr, h: Math.max(50, y1 - y0) * dpr };
  }
  addEventListener('resize', resize);
  resize();
  requestAnimationFrame(resize);

  const stopped = () => st.paused || (scene.levels[1] && scene.z > scene.levels[1].z * 0.6);
  let lastCap = '';

  function frame(now) {
    // The machine: one tick of the 60 Hz timer per due frame, 2,000 cycles each.
    const due = Math.floor((now - st.tickStart) / (1000 / 60));
    if (stopped()) { st.tickStart = now - st.ticks * (1000 / 60); }
    else {
      let n = Math.min(4, due - st.ticks);
      if (n > 3) { st.tickStart = now - due * (1000 / 60); }
      let spent = 0;
      for (let i = 0; i < Math.min(n, 3); i++) {
        board.keys = st.keys | st.touchKeys;
        const t = performance.now();
        machine.run(st.perTick);
        const dt = performance.now() - t;
        spent += dt;
        st.cyclesWindow.push([now, st.perTick, dt]);
        board.tick++;
      }
      if (n > 0 && !FILM) {
        const perTickMs = spent / Math.min(n, 3);
        if (perTickMs > SIM_BUDGET_MS) st.perTick = Math.max(MIN_PER_TICK, Math.round(st.perTick * 0.85));
        else if (perTickMs < SIM_BUDGET_MS * 0.5) st.perTick = Math.min(MAX_PER_TICK, Math.round(st.perTick * 1.05));
      }
      st.ticks = due;
      if (st.follow) {
        const b = ballPixel();
        if (b >= 0 && b !== st.selPixel) select(b);
      }
    }
    while (st.cyclesWindow.length && now - st.cyclesWindow[0][0] > 1000) st.cyclesWindow.shift();
    paintScreen();
    if (!scene.sel) { const b = ballPixel(); select(b >= 0 ? b : 0); }

    stepTour(now);
    if (!st.tour) scene.z += (st.targetZ - scene.z) * 0.18;
    if (Math.abs(st.targetZ - scene.z) < 3e-3) scene.z = st.targetZ;
    let override = null;
    if (st.blend) {
      // After a retarget, ease the camera from where it was.
      const u = Math.min(1, (now - st.blend.t0) / 450);
      const cur = scene.levelAt(scene.z);
      if (u >= 1 || cur.k !== st.blend.k) st.blend = null;
      else {
        const e = 1 - Math.pow(1 - u, 3);
        const a = st.blend.from, b = scene.transform(cur.k, cur.f);
        override = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, s: a.s * Math.pow(b.s / a.s, e) };
      }
    }
    const r0 = performance.now();
    scene.render(now, override);
    st.renderMs = st.renderMs * 0.9 + (performance.now() - r0) * 0.1;
    // HUD.
    updateRuler();
    const k = scene.cur.k;
    const cap = caption(k);
    if (scene.replay && k >= 3) {
      const r = scene.replay;
      cap[1] += ` <br><span class="slowline">Slow motion: gate delay <b>${scene.step}</b> of ${r.steps}. Pink marks the wave of change; ${r.glitches} nets changed more than once before settling.</span>`;
    }
    const key = k + cap[0] + cap[1];
    if (key !== lastCap) { lastCap = key; $('cap-title').innerHTML = cap[0]; $('cap-body').innerHTML = cap[1]; }
    const cyc = st.cyclesWindow.reduce((a, c) => a + c[1], 0);
    const ms = st.cyclesWindow.reduce((a, c) => a + c[2], 0);
    $('stat-clock').textContent = stopped() ? 'stopped' : `${Math.round(cyc / 1000)} kHz`;
    $('stat-cycle').textContent = commas(machine.cycle);
    $('stat-load').textContent = cyc ? `${(ms / cyc * 1e6 / 1000).toFixed(1)} µs` : '—';
    document.body.classList.toggle('deep', k > 0 || scene.z > 0.3);
    if (!FILM) requestAnimationFrame(frame);
  }

  $('stat-gates').textContent = commas(nl.nGates);
  $('stat-rom').textContent = commas(compiled.rom.length);
  if (!FILM) requestAnimationFrame(frame);

  // A small interface for the headless verifier.
  G.app = {
    compiled, nl, machine, scene, st, buildMs,
    state: () => ({ z: scene.z, zMax: scene.zMax, level: scene.cur && scene.cur.k, levels: scene.levels.map(l => l.short), cycle: machine.cycle,
      pixel: st.selPixel, follow: st.follow, stopped: stopped(), tour: !!st.tour, caption: [$('cap-title').textContent, $('cap-body').textContent],
      path: scene.sel && scene.sel.path ? scene.sel.path.map(i => i.type) : null, transistor: scene.transistor, ball: ballPixel(),
      renderMs: st.renderMs, safe: env.safe, slow: !!scene.replay, step: scene.step, hz: st.cyclesWindow.reduce((a, c) => a + c[1], 0) }),
    ram: name => board.ram[compiled.globals.find(g => g.name === name).addr],
    // Run the game's ROM on the reference CPU next to the page's gate-level
    // machine, from reset, and compare every write.
    crossCheck(cycles) {
      const a = new G.machine.Machine(compiled.rom, { netlist: nl }), b = new G.machine.Machine(compiled.rom, { cpu: 'ref' });
      const log = m => { const w = []; const f = m.board.write.bind(m.board); m.board.write = (ad, v, ...r) => { w.push(ad, v); f(ad, v, ...r); }; return w; };
      const wa = log(a), wb = log(b);
      for (let i = 0; i < cycles; i += 2000) { a.run(2000); b.run(2000); a.board.tick++; b.board.tick++; }
      return { writes: wa.length / 2, same: wa.length === wb.length && wa.every((v, i) => v === wb[i]), state: [a.state(), b.state()] };
    },
    zoomTo: z => { stopTour(); st.targetZ = scene.z = Math.max(0, Math.min(scene.zMax, z)); },
    level: i => { stopTour(); st.targetZ = scene.z = scene.levels[i].z; },
    select: p => { st.follow = false; select(p); },
    startTour, stopTour, click, setSlow,
    // Film mode: advance the virtual clock to t milliseconds and draw.
    filmFrame: t => { filmNow = t; frame(t); return { level: scene.cur.k, z: scene.z, tour: !!st.tour }; },
  };
})(globalThis.G2G || (globalThis.G2G = {}));
