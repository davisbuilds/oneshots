// game.js: the game around the simulation: input, the audio-driven clock,
// attempts, practice checkpoints, saved bests, feedback and the menus.
'use strict';
(function (L) {
  const $ = id => document.getElementById(id);
  const DT = L.DT;
  const STORE = 'luminal.v1';
  const params = new URLSearchParams(location.search);
  const TEST = params.has('test');

  // ── Saved progress ─────────────────────────────────────────────────────
  function loadSave() {
    const blank = { attempts: 0, jumps: 0, best: 0, practiceBest: 0, completions: 0, practiceCompletions: 0, firstClear: 0, deaths: new Array(100).fill(0), settings: { volume: 0.8, flash: true, shake: true, autoCheckpoints: true, offsetMs: 0 } };
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return blank;
      const s = JSON.parse(raw);
      return Object.assign(blank, s, { settings: Object.assign(blank.settings, s.settings || {}), deaths: (s.deaths && s.deaths.length === 100) ? s.deaths : blank.deaths });
    } catch (e) { return blank; }
  }
  function writeSave(save) { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch (e) { /* private mode */ } }

  L.startGame = function () {
    const canvas = $('view');
    const lv = L.buildLevel();
    let renderer;
    try { renderer = L.Renderer(canvas); } catch (e) {
      $('fatal').hidden = false; $('fatal').textContent = 'This game needs WebGL2, which this browser does not provide. (' + e.message + ')';
      return;
    }
    const scene = L.Scene(renderer, lv);
    const audio = L.Audio();
    const save = loadSave();
    const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion && !localStorage.getItem(STORE)) { save.settings.flash = false; save.settings.shake = false; }

    const G = {
      lv, save, audio,
      state: 'loading',          // loading | title | playing | paused | dead | complete
      practice: false,
      s: null,                   // simulation state
      attempt: 0,
      runJumps: 0,
      checkpoints: [],           // practice: saved states
      pendingCp: [],             // auto checkpoints waiting to prove safe
      clock: { t: 0, base: 0, perf0: 0, running: false },
      vis: { rot: 0, trail: [], squash: 0 },
      parts: [],
      cam: { x: 0, y: 4.5, zoom: 60, rot: 0, shake: 0, ceilVis: Infinity, punch: 0 },
      flash: 0, flashColor: [1, 1, 1],
      deadAt: 0, holdAtDeath: false,
      input: { keys: new Set(), pointers: new Set(), queue: [], held: false, latchedPress: false },
      debug: params.has('debug'),
      autoplay: params.has('autoplay'),
      lastFrame: performance.now(),
      fps: 60, frameTimes: [],
      newBest: false,
    };
    L.game = G;

    // ── Sizing ───────────────────────────────────────────────────────────
    let W = 0, H = 0, dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, G.lowRes ? 1 : 2);
      const w = Math.floor(innerWidth * dpr), h = Math.floor(innerHeight * dpr);
      W = w; H = h;
      renderer.resize(w, h);
      renderer.scale = dpr;
      canvas.style.width = innerWidth + 'px';
      canvas.style.height = innerHeight + 'px';
    }
    window.addEventListener('resize', resize);
    resize();

    // ── Clock ────────────────────────────────────────────────────────────
    // Song time comes from the audio clock when music plays; a performance.now
    // estimate keeps frames smooth between the audio clock's coarse updates.
    function startClock(t) {
      G.clock.base = t; G.clock.perf0 = performance.now(); G.clock.t = t; G.clock.running = true;
    }
    function songNow() {
      const c = G.clock;
      if (!c.running) return c.t;
      const est = c.base + (performance.now() - c.perf0) / 1000;
      let at = audio.songTime();
      if (at !== null) at -= (save.settings.offsetMs || 0) / 1000;
      if (at !== null) {
        const err = at - est;
        if (Math.abs(err) > 0.06) { c.base += err; }
        else c.base += err * 0.08;
        return c.base + (performance.now() - c.perf0) / 1000;
      }
      return est;
    }

    // ── Input ────────────────────────────────────────────────────────────
    const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'Enter', 'NumpadEnter']);
    function evTime(e) {
      // Stepped tests have no real clock: an input applies at the next step.
      if (TEST && !G.liveInTest) return G.s ? G.s.t : 0;
      const now = performance.now();
      const ago = e && e.timeStamp && e.timeStamp <= now && now - e.timeStamp < 100 ? (now - e.timeStamp) / 1000 : 0;
      return songNow() - ago;
    }
    function press(e) {
      const wasHeld = G.input.keys.size + G.input.pointers.size > 1;
      if (G.state === 'playing') {
        if (!wasHeld) G.input.queue.push({ t: evTime(e), held: true });
      } else if (G.state === 'dead') {
        G.holdAtDeath = true;
        if (performance.now() - G.deadAt > 220) respawn();
      } else if (G.state === 'title' && e && e.type !== 'keydown') {
        // clicks on the title are handled by its buttons
      }
    }
    function release(e) {
      if (G.input.keys.size + G.input.pointers.size > 0) return;
      if (G.state === 'playing') G.input.queue.push({ t: evTime(e), held: false });
    }
    window.addEventListener('keydown', e => {
      if (e.repeat) { if (JUMP_KEYS.has(e.code)) e.preventDefault(); return; }
      if (JUMP_KEYS.has(e.code)) {
        if (G.state === 'title' && !document.activeElement.closest('button, input, select')) { e.preventDefault(); begin(false); return; }
        if (G.state === 'complete') return;
        if (document.activeElement && document.activeElement.closest('#title, #pause, #complete, #settings') && e.code !== 'ArrowUp') return;
        e.preventDefault();
        G.input.keys.add(e.code); press(e);
        return;
      }
      if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); togglePause(); }
      else if (e.code === 'KeyR' && (G.state === 'playing' || G.state === 'dead' || G.state === 'paused')) { showScreen(null); restartRun(true); }
      else if (e.code === 'KeyZ' && G.practice && G.state === 'playing') placeCheckpoint();
      else if (e.code === 'KeyX' && G.practice) removeCheckpoint();
      else if (e.code === 'KeyM') { save.settings.muted = !save.settings.muted; applySettings(); writeSave(save); }
      else if (e.code === 'KeyH' && params.has('debug')) G.debug = !G.debug;
    });
    window.addEventListener('keyup', e => {
      if (!G.input.keys.has(e.code)) return;
      G.input.keys.delete(e.code); release(e);
    });
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== undefined && e.button > 0) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already released */ }
      G.input.pointers.add(e.pointerId); press(e);
    });
    const up = e => { if (G.input.pointers.delete(e.pointerId)) release(e); };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('lostpointercapture', up);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', () => { G.input.keys.clear(); G.input.pointers.clear(); if (G.state === 'playing') { G.input.queue.push({ t: songNow(), held: false }); pause(); } });
    document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing') pause(); });

    // ── Runs ─────────────────────────────────────────────────────────────
    // demo: the solver's route plays the level; nothing is recorded.
    function begin(practice, demo) {
      audio.ensure();
      if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
      G.practice = practice;
      G.demo = !!demo;
      G.autoplay = G.demo || params.has('autoplay');
      G.checkpoints = []; G.pendingCp = [];
      showScreen(null);
      restartRun(true);
    }

    function restartRun(fromStart) {
      G.checkpoints = fromStart && !G.practice ? [] : G.checkpoints;
      const cp = G.practice && G.checkpoints.length ? G.checkpoints[G.checkpoints.length - 1] : null;
      startFrom(cp ? L.respawnState(lv, cp.s) : L.initState(lv));
    }

    function startFrom(s) {
      G.s = s;
      G.attempt++;
      if (!G.practice && !G.demo) save.attempts++;
      G.runJumps = 0;
      G.input.queue = [];
      G.input.held = G.input.keys.size + G.input.pointers.size > 0;
      G.s.held = G.input.held;            // holding through a respawn does not count as a press
      G.vis.trail = []; G.vis.rot = 0;
      G.pendingCp = [];
      G.newBest = false;
      G.sectionIdx = undefined;
      G.state = 'playing';
      G.cam.x = s.x + camLead(); G.cam.y = camTargetY(s, true); G.cam.ceilVis = s.ceil;
      G.attemptLabel = { x: s.x + 6, y: Math.min(s.ceil < 100 ? s.ceil - 2 : 6.2, 6.2), n: G.attempt };
      audio.play(s.t, s.t > 0 ? 0.25 : 0);
      startClock(s.t);
      setHud();
    }

    function respawn() {
      if (G.state !== 'dead') return;
      restartRun(false);
    }

    function die() {
      const s = G.s;
      G.state = 'dead';
      G.deadAt = performance.now();
      G.holdAtDeath = G.input.keys.size + G.input.pointers.size > 0;
      audio.stop(0.12);
      audio.sfxPlay('death');
      const pct = progressOf(s);
      if (G.demo) { /* nothing recorded */ } else if (!G.practice) {
        save.deaths[Math.min(99, Math.floor(pct))]++;
        if (pct > save.best + 0.001) { save.best = pct; G.newBest = true; }
      } else if (pct > save.practiceBest) save.practiceBest = pct;
      if (!G.demo) save.jumps += G.runJumps;
      writeSave(save);
      // feedback: shards, rings, flash and shake
      const col = L.MODE_COLOR[s.mode];
      const R = Math.random;
      for (let i = 0; i < 36; i++) {
        const a = R() * Math.PI * 2, sp = 3 + R() * 14;
        G.parts.push({ kind: 'shard', x: s.x, y: s.y, vx: Math.cos(a) * sp + s.speed * 0.2, vy: Math.sin(a) * sp, life: 0.5 + R() * 0.6, max: 1.1, size: 0.15 + R() * 0.35, c: i % 3 ? col : [1, 1, 1, 1], rot: R() * 6, vr: (R() - 0.5) * 20, g: 18 });
      }
      G.parts.push({ kind: 'ring', x: s.x, y: s.y, life: 0.5, max: 0.5, size: 0.3, grow: 5, w: 0.35, c: [1, 1, 1, 1], alpha: 1 });
      G.parts.push({ kind: 'ring', x: s.x, y: s.y, life: 0.7, max: 0.7, size: 0.5, grow: 8, w: 0.2, c: col, alpha: 0.9 });
      flash([1, 0.25, 0.4], 0.45);
      shake(0.6);
      const el = $('deathinfo');
      el.innerHTML = `<b>${Math.floor(pct)}%</b>` + (G.newBest ? '<span class="nb">New best</span>' : '') + (G.practice ? '<span class="pm">Practice</span>' : '');
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      if (G.newBest) setTimeout(() => audio.sfxPlay('best'), 160);
      setHud();
    }

    function complete() {
      const s = G.s;
      G.state = 'complete';
      save.jumps += G.runJumps;
      let first = false;
      if (G.demo) { save.jumps -= G.runJumps; } else if (!G.practice) {
        save.best = 100; save.completions++;
        if (!save.firstClear) { save.firstClear = save.attempts; first = true; }
      } else { save.practiceBest = 100; save.practiceCompletions++; }
      writeSave(save);
      flash([1, 0.95, 0.85], 0.7);
      for (let i = 0; i < 80; i++) {
        const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 10;
        G.parts.push({ kind: i % 2 ? 'shard' : 'dot', x: s.x, y: s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 4, life: 1.5 + Math.random(), max: 2.5, size: 0.12 + Math.random() * 0.3, c: [[1, 0.9, 0.6, 1], [1, 1, 1, 1], [0.6, 0.95, 1, 1]][i % 3], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, g: 3 });
      }
      for (let k = 0; k < 3; k++) G.parts.push({ kind: 'ring', x: s.x, y: s.y, life: 1 + k * 0.4, max: 1 + k * 0.4, size: 0.5, grow: 14 + k * 6, w: 0.4, c: [1, 0.95, 0.8, 1], alpha: 1 });
      const sum = $('completeStats');
      sum.innerHTML = G.demo
        ? `<div><b>That was the solver's route</b>: ${G.runJumps} jumps, one way through.</div><div>Your turn.</div>`
        : G.practice
        ? `<div><b>Practice run complete</b></div><div>${G.checkpoints.length} checkpoints used · try it without them</div>`
        : `<div><b>${first ? 'First clear' : 'Cleared'}</b> on attempt <b>${save.attempts}</b></div><div>${G.runJumps} jumps this run · ${save.completions} total clear${save.completions === 1 ? '' : 's'}</div>`;
      setTimeout(() => { if (G.state === 'complete') showScreen('complete'); }, 2600);
      setHud();
    }

    function progressOf(s) { return L.clamp(s.x / lv.endX * 100, 0, 100); }

    // ── Practice checkpoints ─────────────────────────────────────────────
    function placeCheckpoint(auto) {
      const s = G.s;
      if (!s || s.dead) return;
      const cp = { s: L.cloneState(s), auto: !!auto };
      if (auto) { G.pendingCp.push({ cp, at: s.t }); return; }
      G.checkpoints.push(cp);
      audio.sfxPlay('checkpoint');
      G.parts.push({ kind: 'ring', x: s.x, y: s.y, life: 0.5, max: 0.5, size: 0.4, grow: 2, w: 0.15, c: [0.4, 1, 0.6, 1], alpha: 1 });
      setHud();
    }
    function removeCheckpoint() {
      if (!G.checkpoints.length) return;
      G.checkpoints.pop();
      audio.sfxPlay('click');
      setHud();
    }
    function autoCheckpoints() {
      if (!G.practice || !save.settings.autoCheckpoints) return;
      const s = G.s;
      const last = G.checkpoints.length ? G.checkpoints[G.checkpoints.length - 1].s.t : -1;
      const lastPend = G.pendingCp.length ? G.pendingCp[G.pendingCp.length - 1].at : -1;
      const since = s.t - Math.max(last, lastPend);
      const stable = s.mode !== 'cube' ? true : s.grounded;
      if (since > L.BEAT * 8 && stable) placeCheckpoint(true);
      // A candidate becomes a checkpoint after the player survives a beat
      // and a half beyond it, so auto checkpoints are never one step from death.
      while (G.pendingCp.length && s.t - G.pendingCp[0].at > L.BEAT * 1.5) {
        G.checkpoints.push(G.pendingCp.shift().cp);
        setHud();
      }
    }

    // ── Feedback helpers ─────────────────────────────────────────────────
    function flash(c, a) { if (!save.settings.flash) a *= 0.25; G.flash = Math.max(G.flash, a); G.flashColor = c; }
    function shake(a) { if (save.settings.shake) G.cam.shake = Math.max(G.cam.shake, a); }

    function onEvent(e) {
      const col = L.MODE_COLOR[G.s.mode];
      if (e.type === 'jump') {
        G.runJumps++;
        for (let i = 0; i < 6; i++) G.parts.push({ kind: 'dot', x: e.x - 0.3, y: e.y - 0.5 * G.s.grav, vx: -2 - Math.random() * 3, vy: (Math.random() * 2) * G.s.grav, life: 0.3, max: 0.3, size: 0.08, c: col, g: 0 });
      } else if (e.type === 'land') {
        G.vis.squash = 1;
        for (let i = 0; i < 5; i++) G.parts.push({ kind: 'dot', x: e.x, y: e.y - 0.5 * G.s.grav, vx: (Math.random() - 0.7) * 4, vy: Math.random() * 1.5 * G.s.grav, life: 0.25, max: 0.25, size: 0.07, c: [1, 1, 1, 1], g: 0 });
      } else if (e.type === 'orb' || e.type === 'pad') {
        const c = e.kind.startsWith('grav') ? [0.25, 0.75, 1, 1] : [1, 0.85, 0.3, 1];
        G.parts.push({ kind: 'ring', x: e.x, y: e.y, life: 0.35, max: 0.35, size: 0.4, grow: 1.6, w: 0.18, c, alpha: 1 });
        if (e.kind.startsWith('grav')) flash([0.3, 0.7, 1], 0.08);
      } else if (e.type === 'portal') {
        const pc = e.kind === 'mode' ? L.MODE_COLOR[e.mode] : e.kind === 'gravity' ? (e.grav < 0 ? [1, 0.85, 0.3, 1] : [0.25, 0.65, 1, 1]) : [1, 0.75, 0.35, 1];
        G.parts.push({ kind: 'ring', x: G.s.x, y: G.s.y, life: 0.6, max: 0.6, size: 0.5, grow: 6, w: 0.3, c: pc, alpha: 1 });
        if (e.kind === 'mode' || e.kind === 'speed') { flash([pc[0], pc[1], pc[2]], 0.18); G.cam.punch = 1; }
        G.vis.trail = [];
      } else if (e.type === 'finish') {
        complete();
      }
      void col;
    }

    // ── Simulation stepping ──────────────────────────────────────────────
    function advance(target) {
      const s = G.s;
      let steps = 0;
      const q = G.input.queue;
      const events = [];
      while (G.state === 'playing' && s.t + DT <= target && steps < 240) {
        // Apply input events up to the middle of this step; a press and
        // release inside one step still counts as a one-step press.
        let pressedNow = false;
        while (q.length && q[0].t <= s.t + DT * 0.5) {
          const e = q.shift();
          if (e.held && !G.input.held) pressedNow = true;
          G.input.held = e.held;
        }
        let held = G.input.held || pressedNow;
        if (G.autoplay && L.route) held = !!L.route[s.n];
        events.length = 0;
        L.step(lv, s, held, events);
        steps++;
        for (const e of events) onEvent(e);
        if (s.dead) { die(); break; }
        if (G.state !== 'playing') break;
        autoCheckpoints();
        // trail sample every other step
        if (s.n % 2 === 0) {
          G.vis.trail.push([s.x, s.y]);
          const max = s.mode === 'wave' ? 120 : 14;
          while (G.vis.trail.length > max) G.vis.trail.shift();
        }
      }
      return steps;
    }

    function camLead() { return (W / 2 / G.cam.zoom) * 0.42; }
    function camTargetY(s, snap) {
      const halfH = H / 2 / G.cam.zoom;
      if (s.ceil < 100) return (s.floor + s.ceil) / 2;
      const base = halfH - 2.4;
      return Math.max(base, s.y + 3.2 - halfH);
    }

    // ── Frame ────────────────────────────────────────────────────────────
    function frame(now) {
      requestAnimationFrame(frame);
      const dtf = Math.min(0.1, (now - G.lastFrame) / 1000);
      G.lastFrame = now;
      G.frameTimes.push(dtf); if (G.frameTimes.length > 60) G.frameTimes.shift();
      // A device that cannot hold ~45 fps drops to one pixel per CSS pixel.
      if (!G.lowRes && !TEST && G.state === 'playing' && dpr > 1 && G.frameTimes.length === 60) {
        const avg = G.frameTimes.reduce((a, b) => a + b, 0) / 60;
        if (avg > 1 / 45) { G.lowRes = true; resize(); }
      }
      if (!TEST || G.liveInTest) tick(dtf);
      draw(dtf);
    }

    function tick(dtf) {
      if (G.state === 'playing') {
        advance(songNow());
      } else if (G.state === 'dead') {
        if (performance.now() - G.deadAt > 650 && !G.input.keys.size && !G.input.pointers.size) respawn();
        else if (performance.now() - G.deadAt > 650 && G.holdAtDeath) respawn();
      } else if (G.state === 'complete') {
        // keep the world moving past the gate
        G.s.t += dtf;
        G.s.x = L.xAt(lv, G.s.t);
      }
    }

    function updateVisuals(dtf) {
      const s = G.s;
      const zoom = Math.min(H / 12.2, W / 18);
      G.cam.zoom = zoom;
      if (s) {
        // after the finish the camera stops and the player flies into the gate
        const tx = Math.min(s.x, lv.endX - 2) + camLead();
        G.cam.x = tx;
        const ty = camTargetY(s);
        const k = 1 - Math.exp(-dtf * (s.ceil < 100 ? 5 : 4));
        G.cam.y += (ty - G.cam.y) * k;
        G.cam.ceilVis = s.ceil;
        // cube rotation: half a turn per jump, settling square on landing
        if (s.mode === 'cube' && !s.dead) {
          if (!s.grounded) G.vis.rot -= Math.PI / L.BEAT * dtf * s.grav;
          else {
            const q = Math.PI / 2;
            const target = Math.round(G.vis.rot / q) * q;
            G.vis.rot += (target - G.vis.rot) * (1 - Math.exp(-dtf * 30));
          }
        }
      }
      G.vis.squash = Math.max(0, G.vis.squash - dtf * 6);
      for (const p of G.parts) {
        p.life -= dtf;
        if (p.vx !== undefined) { p.x += p.vx * dtf; p.y += (p.vy || 0) * dtf; p.vy = (p.vy || 0) - (p.g || 0) * dtf; }
        if (p.vr) p.rot += p.vr * dtf;
      }
      G.parts = G.parts.filter(p => p.life > 0);
      G.flash = Math.max(0, G.flash - dtf * 2.2);
      G.cam.shake = Math.max(0, G.cam.shake - dtf * 2.5);
      G.cam.punch = Math.max(0, G.cam.punch - dtf * 3);
    }

    function draw(dtf) {
      updateVisuals(dtf);
      const s = G.s;
      const t = s ? s.t : (performance.now() / 1000) % 30;
      const sig = L.song.signals(Math.max(0, t));
      const cam = Object.assign({}, G.cam);
      const sh = G.cam.shake * G.cam.shake;
      if (sh > 0) { cam.x += (Math.random() - 0.5) * sh * 0.8; cam.y += (Math.random() - 0.5) * sh * 0.8; }
      cam.zoom *= 1 + G.cam.punch * 0.025 + sig.kick * 0.006 * sig.energy;
      if (G.state === 'title' || G.state === 'loading') {
        // the title flies slowly along the opening of the level
        const tt = (performance.now() / 1000) * 0.6 % 40;
        cam.x = 10 + tt * 4; cam.y = H / 2 / G.cam.zoom - 2.4;
      }
      const P = renderer.post;
      P.bloom = 0.85 + sig.kick * 0.2 * sig.energy;
      P.aberr = (0.0015 + sig.crash * 0.006 * (save.settings.flash ? 1 : 0.2) + G.cam.punch * 0.004) * (sig.energy);
      const fl = G.flash + (save.settings.flash ? sig.crash * 0.12 : 0);
      P.flash = [G.flashColor[0], G.flashColor[1], G.flashColor[2], Math.min(0.6, fl)];
      const bestPct = G.practice ? save.practiceBest : save.best;
      const view = scene.draw({ s: G.state === 'title' || G.state === 'loading' ? null : s, cam, t, sig, vis: G.vis, parts: G.parts, W, H, debug: G.debug, bestX: bestPct > 0 && bestPct < 100 ? bestPct / 100 * lv.endX : null });
      renderer.end(performance.now() / 1000);
      G.view = view;
      // Attempt label rides in the world like a sign.
      const lab = $('attemptLabel');
      if (G.attemptLabel && s && G.state !== 'title' && G.state !== 'loading') {
        const sx = (G.attemptLabel.x - cam.x) * cam.zoom / dpr + innerWidth / 2;
        const sy = innerHeight / 2 - (G.attemptLabel.y - cam.y) * cam.zoom / dpr;
        lab.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`;
        lab.textContent = G.demo ? 'Demo · the solver plays' : (G.practice ? 'Practice · ' : '') + 'Attempt ' + G.attemptLabel.n;
        lab.style.opacity = sx < -200 ? 0 : 1;
      } else lab.style.opacity = 0;
      // Teaching signs, until the first clear.
      const signs = $('signs');
      if (!signs.children.length) for (const m of lv.marks) { const d = document.createElement('div'); d.textContent = m.label; signs.appendChild(d); }
      const showSigns = s && !save.completions && G.state !== 'title' && G.state !== 'loading';
      lv.marks.forEach((m, i) => {
        const el = signs.children[i];
        const sx = (m.x - cam.x) * cam.zoom / dpr + innerWidth / 2;
        const sy = innerHeight / 2 - (m.y - cam.y) * cam.zoom / dpr;
        const on = showSigns && sx > -400 && sx < innerWidth + 400;
        el.style.opacity = on ? 1 : 0;
        if (on) el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`;
      });
      // Section cards: the name of each part of the journey as it begins.
      if (s && G.state === 'playing') {
        let si = 0;
        while (si + 1 < lv.sections.length && lv.sections[si + 1].t <= s.t) si++;
        if (si !== G.sectionIdx) {
          const fresh = G.sectionIdx !== undefined && si > G.sectionIdx && s.t - lv.sections[si].t < 0.5;
          G.sectionIdx = si;
          const sec = lv.sections[si];
          if (fresh && (sec.drop || sec.finale)) {
            // the drop and the last chord: the world bursts outward from the player
            for (let k = 0; k < 4; k++) G.parts.push({ kind: 'ring', x: s.x, y: s.y, life: 0.7 + k * 0.25, max: 0.7 + k * 0.25, size: 0.5, grow: 16 + k * 8, w: 0.5, c: k % 2 ? [1, 0.85, 0.4, 1] : [1, 1, 1, 1], alpha: 0.9 });
            for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2; G.parts.push({ kind: 'dot', x: s.x, y: s.y, vx: Math.cos(a) * 18, vy: Math.sin(a) * 18, life: 0.8, max: 0.8, size: 0.12, c: [1, 0.95, 0.8, 1], g: 0 }); }
            flash([1, 0.95, 0.85], 0.35); shake(0.35); G.cam.punch = 1;
          }
          if (fresh || (si === 0 && s.t < 0.1)) {
            const el = $('sectionCard');
            const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][si];
            el.innerHTML = `<span>${roman}</span>${lv.sections[si].name}`;
            el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
          }
        }
      }
      if (s && (G.state === 'playing' || G.state === 'dead')) {
        const pct = progressOf(s);
        $('progFill').style.width = pct.toFixed(2) + '%';
        $('progPct').textContent = Math.floor(pct) + '%';
      }
    }

    // ── HUD and screens ──────────────────────────────────────────────────
    function setHud() {
      const playing = G.state === 'playing' || G.state === 'dead' || G.state === 'paused';
      $('hud').hidden = !playing && G.state !== 'complete';
      $('practiceBar').hidden = !G.practice || !playing;
      $('cpCount').textContent = G.checkpoints.length;
      $('progBest').style.left = (G.practice ? save.practiceBest : save.best) + '%';
      $('hud').classList.toggle('practice', G.practice);
      // checkpoint marks on the progress bar
      const marks = $('cpMarks');
      marks.innerHTML = '';
      if (G.practice) for (const cp of G.checkpoints) {
        const m = document.createElement('i');
        m.style.left = progressOf(cp.s) + '%';
        marks.appendChild(m);
      }
    }

    function showScreen(name) {
      for (const id of ['title', 'pause', 'complete']) $(id).hidden = id !== name;
      if (name === 'title') renderTitleStats();
      if (name) {
        const first = $(name).querySelector('button.primary');
        if (first) first.focus({ preventScroll: true });
      }
    }

    function renderTitleStats() {
      const st = $('stats');
      const heat = save.deaths;
      const max = Math.max(1, ...heat);
      let bars = '';
      for (let i = 0; i < 100; i += 2) {
        const v = (heat[i] + heat[i + 1]) / max;
        bars += `<i style="height:${Math.max(4, Math.min(100, v * 100)).toFixed(0)}%;opacity:${(0.25 + 0.75 * Math.min(1, v)).toFixed(2)}"></i>`;
      }
      st.innerHTML = `
        <div class="stat"><span>Best</span><b>${Math.floor(save.best)}%</b></div>
        <div class="stat"><span>Practice</span><b>${Math.floor(save.practiceBest)}%</b></div>
        <div class="stat"><span>Attempts</span><b>${save.attempts}</b></div>
        <div class="stat"><span>Clears</span><b>${save.completions}</b></div>
        <div class="heat" title="Where your attempts ended">${bars}<em style="left:${save.best}%"></em></div>`;
    }

    function pause() {
      if (G.state !== 'playing') return;
      G.state = 'paused';
      G.pausedAt = G.s.t;
      audio.stop(0.05);
      G.clock.running = false; G.clock.t = G.s.t;
      $('pauseInfo').textContent = `${Math.floor(progressOf(G.s))}% · attempt ${G.attempt}` + (G.practice ? ' · practice' : '');
      $('practiceToggle').textContent = G.practice ? 'Leave practice' : 'Practice mode';
      showScreen('pause');
      setHud();
    }
    function resume() {
      if (G.state !== 'paused') return;
      showScreen(null);
      G.state = 'playing';
      G.input.queue = []; G.input.held = false; G.s.held = G.input.keys.size + G.input.pointers.size > 0;
      // rewind half a beat with the music so the player can find the beat again
      audio.play(G.s.t, 0.15);
      startClock(G.s.t);
      setHud();
    }
    function togglePause() {
      if (G.state === 'playing') pause();
      else if (G.state === 'paused') resume();
    }
    function toTitle() {
      audio.stop(0.2);
      G.state = 'title'; G.s = null;
      showScreen('title');
      setHud();
    }

    function applySettings() {
      audio.volume = save.settings.volume;
      audio.muted = !!save.settings.muted;
      audio.applyVolume();
      $('vol').value = Math.round(save.settings.volume * 100);
      $('optFlash').checked = save.settings.flash;
      $('optShake').checked = save.settings.shake;
      $('optAuto').checked = save.settings.autoCheckpoints;
      $('offset').value = save.settings.offsetMs || 0;
      $('offsetVal').textContent = (save.settings.offsetMs > 0 ? '+' : '') + (save.settings.offsetMs || 0) + ' ms';
      $('muteBtn').setAttribute('aria-pressed', save.settings.muted ? 'true' : 'false');
      $('muteBtn').textContent = save.settings.muted ? 'Sound off' : 'Sound on';
    }

    // buttons
    $('playBtn').onclick = () => begin(false);
    $('practiceBtn').onclick = () => begin(true);
    $('watchBtn').onclick = () => begin(false, true);
    $('resumeBtn').onclick = resume;
    $('restartBtn').onclick = () => { showScreen(null); restartRun(true); };
    $('practiceToggle').onclick = () => { const p = !G.practice; G.checkpoints = []; begin(p); };
    $('quitBtn').onclick = toTitle;
    $('againBtn').onclick = () => { showScreen(null); G.checkpoints = []; if (G.demo) begin(false); else restartRun(true); };
    $('titleBtn').onclick = toTitle;
    $('pauseBtn').onclick = e => { e.currentTarget.blur(); togglePause(); };
    $('cpAdd').onclick = e => { e.currentTarget.blur(); placeCheckpoint(); };
    $('cpDel').onclick = e => { e.currentTarget.blur(); removeCheckpoint(); };
    for (const b of document.querySelectorAll('.hudbtn')) b.addEventListener('pointerdown', e => e.stopPropagation());
    $('vol').oninput = e => { save.settings.volume = e.target.value / 100; save.settings.muted = false; applySettings(); writeSave(save); };
    $('optFlash').onchange = e => { save.settings.flash = e.target.checked; writeSave(save); };
    $('optShake').onchange = e => { save.settings.shake = e.target.checked; writeSave(save); };
    $('optAuto').onchange = e => { save.settings.autoCheckpoints = e.target.checked; writeSave(save); };
    $('offset').oninput = e => { save.settings.offsetMs = +e.target.value; applySettings(); writeSave(save); };
    $('muteBtn').onclick = () => { save.settings.muted = !save.settings.muted; applySettings(); writeSave(save); };
    $('resetBtn').onclick = () => {
      if (!confirm('Erase your attempts, bests and clears?')) return;
      const keep = save.settings;
      Object.assign(save, loadSave.call(null), { settings: keep });
      save.attempts = 0; save.jumps = 0; save.best = 0; save.practiceBest = 0; save.completions = 0; save.practiceCompletions = 0; save.firstClear = 0; save.deaths = new Array(100).fill(0);
      writeSave(save); renderTitleStats();
    };
    applySettings();

    // ── Loading: compose the soundtrack, then open the title ─────────────
    showScreen('title');
    $('playBtn').disabled = true; $('practiceBtn').disabled = true; $('watchBtn').disabled = true;
    const loadEl = $('loadState');
    const t0 = performance.now();
    let firstChunk = true;
    G.audioDone = false;
    const enable = () => {
      G.state = 'title';
      $('playBtn').disabled = false; $('practiceBtn').disabled = false; $('watchBtn').disabled = false;
      $('playBtn').focus({ preventScroll: true });
      document.body.classList.add('ready');
    };
    L.renderSong(chunk => {
      audio.addChunk(chunk);
      if (firstChunk) {
        firstChunk = false;
        G.renderMs = performance.now() - t0;
        loadEl.textContent = '';
        enable();
      }
    }).then(chunks => {
      G.audioDone = true;
      G.renderAllMs = performance.now() - t0;
      G.chunks = chunks;
    }).catch(err => {
      console.warn(err);
      loadEl.textContent = 'Audio is unavailable here, so the game will run silently.';
      enable();
    });

    // ── Test interface ───────────────────────────────────────────────────
    // Drives the production update with explicit per-step inputs.
    G.api = {
      ready: () => G.state !== 'loading',
      snapshot: () => ({ state: G.state, practice: G.practice, attempt: G.attempt, t: G.s && G.s.t, x: G.s && G.s.x, y: G.s && G.s.y, mode: G.s && G.s.mode, grav: G.s && G.s.grav, dead: G.s && G.s.dead, pct: G.s ? progressOf(G.s) : 0, checkpoints: G.checkpoints.length, save: JSON.parse(JSON.stringify(save)), held: G.input.held }),
      begin: (practice, demo) => begin(!!practice, !!demo),
      // Advance n steps using live input state (keys/pointers) or a route.
      step(n, route) {
        for (let k = 0; k < n && G.state === 'playing'; k++) {
          if (route) { const h = !!route[G.s.n]; if (h !== G.input.held) G.input.queue.push({ t: G.s.t, held: h }); }
          advance(G.s.t + DT + 1e-9);
        }
        return G.api.snapshot();
      },
      tick: ms => { tick(ms / 1000); return G.api.snapshot(); },
      jumpTo(beat) {
        // practice helper for screenshots: solve-free warp along a route
        const r = L.route; if (!r) return;
        const s = L.initState(lv);
        const target = beat * L.BEAT;
        while (s.t < target && !s.dead) L.step(lv, s, !!r[s.n]);
        G.s = s; G.state = 'playing'; G.vis.trail = [];
        G.cam.y = camTargetY(s);
        return G.api.snapshot();
      },
      draw: () => draw(1 / 60),
      pause, resume, toTitle, placeCheckpoint, removeCheckpoint, respawn,
      audioReady: () => audio.chunks.length,
      clock: () => songNow(),
    };
    requestAnimationFrame(frame);
  };
})(globalThis.LUMINAL = globalThis.LUMINAL || {});
