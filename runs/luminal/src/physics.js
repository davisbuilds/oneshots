// physics.js: the whole simulation, one fixed 1/240 s step at a time.
// The browser game, the solver and the tests all call the same step(), so a
// route the solver proves is a route a player can take.
'use strict';
(function (L) {
  const P = L.PHYS;
  const CELL = 4;   // broadphase bucket width, blocks

  // ---- level compilation -------------------------------------------------
  // The level is authored in beats (level.js); here it becomes geometry in
  // blocks, with buckets for fast lookups.
  function bucketize(list, x0of, x1of) {
    const cells = [];
    list.forEach((o, i) => {
      const a = Math.floor(x0of(o) / CELL), b = Math.floor(x1of(o) / CELL);
      for (let c = a; c <= b; c++) (cells[c] || (cells[c] = [])).push(i);
    });
    return cells;
  }

  L.compile = function (lv) {
    lv.solidCells = bucketize(lv.solids, o => o.x0, o => o.x1);
    lv.hazardCells = bucketize(lv.hazards, o => o.x0, o => o.x1);
    lv.trigCells = bucketize(lv.triggers, o => o.x0, o => o.x1);
    lv.portals.sort((a, b) => a.x - b.x);
    return lv;
  };

  // x position and speed at time t: speed changes happen at known times, so
  // x is a pure function of time and the world never drifts off the music.
  function segAt(lv, t) {
    const segs = lv.speedSegs;
    let i = segs.length - 1;
    while (i > 0 && segs[i].t > t) i--;
    return segs[i];
  }
  L.xAt = (lv, t) => { const s = segAt(lv, t); return s.x + s.v * (t - s.t); };
  L.speedAt = (lv, t) => segAt(lv, t).v;
  L.tAtX = (lv, x) => {
    const segs = lv.speedSegs;
    let i = segs.length - 1;
    while (i > 0 && segs[i].x > x) i--;
    return segs[i].t + (x - segs[i].x) / segs[i].v;
  };

  // ---- state ---------------------------------------------------------------
  L.initState = function (lv) {
    return {
      t: 0, n: 0, x: 0, y: P.box.cube[1], vy: 0,
      mode: 'cube', grav: 1, grounded: true, coyote: 0, buffer: 0, held: false,
      floor: 0, ceil: Infinity, speed: L.speedAt(lv, 0),
      dead: false, finished: false, cause: '', portal: 0, jumps: 0,
      used: new Uint8Array(lv.triggers.length),
    };
  };

  L.cloneState = function (s) {
    const c = Object.assign({}, s);
    c.used = s.used.slice();
    return c;
  };

  // The state of a run that respawns at this one: trigger use ahead is reset.
  L.respawnState = function (lv, s) {
    const c = L.cloneState(s);
    lv.triggers.forEach((o, i) => { if (o.x1 >= c.x - 0.6) c.used[i] = 0; });
    c.held = false; c.buffer = 0; c.dead = false; c.cause = '';
    return c;
  };

  const overlap = (ax0, ay0, ax1, ay1, o) => ax1 > o.x0 && ax0 < o.x1 && ay1 > o.y0 && ay0 < o.y1;

  function circleBox(cx, cy, r, x0, y0, x1, y1) {
    const dx = cx < x0 ? x0 - cx : cx > x1 ? cx - x1 : 0;
    const dy = cy < y0 ? y0 - cy : cy > y1 ? cy - y1 : 0;
    return dx * dx + dy * dy < r * r;
  }

  function die(s, cause, ev) {
    s.dead = true; s.cause = cause;
    if (ev) ev.push({ type: 'death', cause, x: s.x, y: s.y, t: s.t });
  }

  function touchingTrigger(lv, s, hw, hh, kindTest) {
    const cells = lv.trigCells, list = lv.triggers;
    const c0 = Math.floor((s.x - hw) / CELL), c1 = Math.floor((s.x + hw) / CELL);
    for (let c = c0; c <= c1; c++) {
      const cell = cells[c];
      if (!cell) continue;
      for (const i of cell) {
        if (s.used[i]) continue;
        const o = list[i];
        if (!kindTest(o)) continue;
        if (o.r ? circleBox(o.cx, o.cy, o.r, s.x - hw, s.y - hh, s.x + hw, s.y + hh)
                : overlap(s.x - hw, s.y - hh, s.x + hw, s.y + hh, o)) return i;
      }
    }
    return -1;
  }

  function useOrb(lv, s, i, ev) {
    const o = lv.triggers[i];
    s.used[i] = 1;
    s.grounded = false; s.coyote = 0; s.buffer = 0;
    if (o.kind === 'gravorb') {
      s.grav = -s.grav;
      s.vy = -s.grav * P.gravOrbPush;
    } else if (o.kind === 'pinkorb') {
      s.vy = P.orbJump * 0.72 * s.grav;
    } else {
      s.vy = P.orbJump * s.grav;
    }
    if (ev) ev.push({ type: 'orb', kind: o.kind, x: o.cx, y: o.cy, t: s.t });
  }

  function applyPortal(s, p, ev) {
    if (p.kind === 'mode' && p.mode !== s.mode) {
      const from = s.mode;
      s.mode = p.mode;
      if (p.mode === 'ship') s.vy *= 0.5;
      if (from !== 'cube' && p.mode === 'cube') s.vy = L.clamp(s.vy, -P.jump * 0.6, P.jump * 0.6);
      s.grounded = false;
    }
    if (p.kind === 'gravity' && p.grav !== s.grav) {
      s.grav = p.grav;
      s.vy *= 0.5;
      s.grounded = false;
    }
    if (p.floor !== undefined) s.floor = p.floor;
    if (p.ceil !== undefined) s.ceil = p.ceil;
    if (ev) ev.push({ type: 'portal', kind: p.kind, mode: p.mode, grav: p.grav, speed: p.speed, x: p.x, t: s.t });
  }

  // ---- one step ------------------------------------------------------------
  // held: whether the button is down during this step. A press is a step
  // where it is down and was up before.
  L.step = function (lv, s, held, ev) {
    if (s.dead || s.finished) return;
    const dt = L.DT;
    const pressed = held && !s.held;
    s.held = held;
    s.buffer = pressed ? P.buffer : Math.max(0, s.buffer - dt);
    let box = P.box[s.mode];
    let hw = box[0], hh = box[1];
    const wasGrounded = s.grounded;

    // 1. Velocity from input.
    let orbUsed = false;
    if (s.buffer > 0) {
      const i = touchingTrigger(lv, s, hw, hh, o => o.orb);
      if (i >= 0) { useOrb(lv, s, i, ev); orbUsed = true; }
    }
    const g = s.grav;
    if (!orbUsed) {
      if (s.mode === 'cube') {
        if ((s.grounded || s.coyote > 0) && (held || s.buffer > 0)) {
          s.vy = P.jump * g;
          s.grounded = false; s.coyote = 0; s.buffer = 0; s.jumps++;
          if (ev) ev.push({ type: 'jump', x: s.x, y: s.y, t: s.t });
        } else {
          // Gravity applies even at rest; the surface check below puts the
          // cube back on its floor each step, which keeps contact stable.
          s.vy -= P.gravity * g * dt;
          if (s.vy * g < -P.fallMax) s.vy = -P.fallMax * g;
        }
      } else if (s.mode === 'ship') {
        s.vy += (held ? P.shipUp : -P.shipDown) * g * dt;
        s.vy = L.clamp(s.vy, -P.shipMax, P.shipMax);
      } else {
        s.vy = (held ? 1 : -1) * g * s.speed * P.waveSlope;
      }
    } else if (s.mode === 'wave') {
      s.vy = (held ? 1 : -1) * s.grav * s.speed * P.waveSlope;
    }

    // 2. Move. x comes from the clock, y from the velocity.
    s.t += dt; s.n++;
    s.x = L.xAt(lv, s.t);
    s.speed = L.speedAt(lv, s.t);
    s.y += s.vy * dt;
    s.coyote = Math.max(0, s.coyote - dt);

    // 3. Portals are full-height gates: crossing one always applies it.
    while (s.portal < lv.portals.length && lv.portals[s.portal].x <= s.x) {
      applyPortal(s, lv.portals[s.portal], ev);
      s.portal++;
      box = P.box[s.mode]; hw = box[0]; hh = box[1];
    }

    // 4. Pads fire on touch.
    const pi = touchingTrigger(lv, s, hw, hh, o => o.pad);
    if (pi >= 0) {
      const o = lv.triggers[pi];
      s.used[pi] = 1; s.grounded = false; s.coyote = 0;
      if (o.kind === 'gravpad') { s.grav = -s.grav; s.vy = -s.grav * P.gravOrbPush * 1.6; }
      else if (o.kind === 'pinkpad') s.vy = P.jump * 1.04 * s.grav;
      else s.vy = P.padJump * s.grav;
      if (ev) ev.push({ type: 'pad', kind: o.kind, x: (o.x0 + o.x1) / 2, y: o.y0, t: s.t });
    }

    // 5. Surfaces. Floor and ceiling are always safe to touch.
    const gg = s.grav;
    s.grounded = false;
    if (s.y - hh < s.floor) {
      s.y = s.floor + hh;
      if (s.vy < 0) s.vy = 0;
      if (gg === 1) s.grounded = true;
    }
    if (s.y + hh > s.ceil) {
      s.y = s.ceil - hh;
      if (s.vy > 0) s.vy = 0;
      if (gg === -1) s.grounded = true;
    }
    const snap = hh * (1 - P.inner) + 1e-6;
    const iw = hw * P.inner, ih = hh * P.inner;
    {
      const cells = lv.solidCells, list = lv.solids;
      const c0 = Math.floor((s.x - hw) / CELL), c1 = Math.floor((s.x + hw) / CELL);
      for (let c = c0; c <= c1 && !s.dead; c++) {
        const cell = cells[c];
        if (!cell) continue;
        for (const i of cell) {
          const o = list[i];
          if (!overlap(s.x - hw, s.y - hh, s.x + hw, s.y + hh, o)) continue;
          const vg = s.vy * gg;
          const feetPen = gg === 1 ? o.y1 - (s.y - hh) : (s.y + hh) - o.y0;
          const headPen = gg === 1 ? (s.y + hh) - o.y0 : o.y1 - (s.y - hh);
          if (vg <= 0 && feetPen <= snap) {
            s.y = gg === 1 ? o.y1 + hh : o.y0 - hh;
            s.vy = 0; s.grounded = true;
          } else if (vg > 0 && headPen <= snap) {
            s.y = gg === 1 ? o.y0 - hh : o.y1 + hh;
            s.vy = 0;
          } else if (overlap(s.x - iw, s.y - ih, s.x + iw, s.y + ih, o)) {
            die(s, 'wall', ev); break;
          }
        }
      }
    }
    if (s.dead) return;
    if (s.mode === 'cube') {
      if (wasGrounded && !s.grounded && s.vy * gg <= 0 && !pressed) s.coyote = P.coyote;
      if (s.grounded && !wasGrounded && ev) ev.push({ type: 'land', x: s.x, y: s.y, t: s.t });
    }

    // 6. Hazards: small, honest hitboxes (see level.js for their sizes).
    {
      const cells = lv.hazardCells, list = lv.hazards;
      const x0 = s.x - hw, x1 = s.x + hw, y0 = s.y - hh, y1 = s.y + hh;
      const c0 = Math.floor(x0 / CELL), c1 = Math.floor(x1 / CELL);
      for (let c = c0; c <= c1; c++) {
        const cell = cells[c];
        if (!cell) continue;
        for (const i of cell) {
          const o = list[i];
          const hit = o.r ? circleBox(o.cx, o.cy, o.r, x0, y0, x1, y1) : overlap(x0, y0, x1, y1, o);
          if (hit) { die(s, o.type, ev); return; }
        }
      }
    }

    if (s.y > 60 || s.y < -30) { die(s, 'void', ev); return; }
    if (s.x >= lv.endX) {
      s.finished = true;
      if (ev) ev.push({ type: 'finish', x: s.x, y: s.y, t: s.t });
    }
  };

  // Run a list of per-step inputs (a function or an array) until death,
  // finish or maxSteps. Returns the final state.
  L.simulate = function (lv, s, inputAt, maxSteps, ev) {
    const f = typeof inputAt === 'function' ? inputAt : n => !!inputAt[n];
    for (let k = 0; k < maxSteps && !s.dead && !s.finished; k++) L.step(lv, s, f(s.n), ev);
    return s;
  };
})(globalThis.LUMINAL = globalThis.LUMINAL || {});
