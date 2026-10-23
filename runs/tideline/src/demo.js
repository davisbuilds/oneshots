// demo.js: the hands-off tour, 45 seconds that work as a short film.
// Shots are functions of tour time; targets that depend on the simulation
// (which crane is about to hand a box to a waiting carrier) are chosen when
// a shot begins, so a frame-by-frame render is deterministic.
'use strict';
(function (TL) {
  const $ = (s) => document.querySelector(s);
  const L = TL.Layout;
  const D = TL.Demo = { on: false, speed: 12 };
  let app;

  const SHOTS = [
    { d: 6.5, cap: ['Arden Bay Container Terminal', 'Three berths, six ship-to-shore cranes, 22 straddle carriers, one gate'],
      cam: (u) => ({ x: 330 - u * 60, y: -40 + u * 40, zoom: 0.46 - u * 0.08 }) },
    { d: 8.5, cap: ['A crane sets a box into a waiting straddle carrier', 'Trolley and hoist on trapezoidal profiles; the apron lane is reserved while the spreader is low'],
      pick: 'handover', cine: true, cam: (u, s) => ({ x: s.x - 2 + u * 3, y: s.y - 9, zoom: 0.07 - u * 0.012, az: 1.27 + u * 0.12, el: 0.5 }) },
    { d: 7.5, cap: ['Every carrier drives a path reserved in space and time', 'Safe-interval planning with token passing: no collisions, no deadlocks, checked over many seeds'],
      pick: 'follow', cine: true, cam: (u, s) => ({ x: s.x, y: s.y - 4, zoom: 0.07 + u * 0.06, az: 1.39 + u * 0.5, el: 0.5 + u * 0.1 }) },
    { d: 7, cap: ['Trucks check in at the gate, reverse into a bay, and are served from behind', 'Queue, turn time and yard occupancy feed the KPIs above'],
      cine: true, cam: (u) => ({ x: 905 - u * 70, y: 392, zoom: 0.115 - u * 0.01 }) },
    { d: 9, cap: ['Each box changes the ship: draft, trim, list and GM', 'Anti-heel pumps level her; a plan that breaks the limits is refused'],
      pick: 'ship', cam: (u, s) => ({ x: s.x + 30 - u * 20, y: 20, zoom: 0.17 }) },
    { d: 6.5, cap: ['Tideline', 'An operations console that plays like a strategy game'],
      cam: (u) => ({ x: 200 + u * 15, y: 40 + u * 10, zoom: 0.21 + u * 0.05 }) },
  ];
  D.length = SHOTS.reduce((a, s) => a + s.d, 0);

  D.start = function (a) {
    app = a || TL.app;
    D.on = true; D.t = 0; D.shot = -1; D.state = {};
    D.saved = { speed: app.speed, paused: app.paused };
    app.paused = false; app.speed = D.speed;
    TL.UI.setSpeed(D.speed);
    $('#demoBar').classList.add('on');
    document.body.classList.add('demo');
    app.camAnim = null;
    D.from = Object.assign({}, app.r.cam);
    app.hideCallouts = false;
    TL.UI.select('call', app.sim.calls[0], {});
  };
  D.stop = function () {
    if (!D.on) return;
    D.on = false;
    $('#demoBar').classList.remove('on');
    $('#caption').style.opacity = 0;
    document.body.classList.remove('demo', 'capon', 'cine');
    if (app) { app.r.cam.az = -Math.PI / 4; app.r.cam.el = 0.62; }
    document.querySelector('#stabSect') && document.querySelector('#stabSect').classList.remove('glow');
    if (app && D.saved) TL.UI.setSpeed(D.saved.paused ? 0 : D.saved.speed);
  };

  // Choose what a shot looks at, from the live simulation.
  function choose(shot) {
    const sim = app.sim, t = app.simT;
    if (shot.pick === 'handover') {
      // A discharge whose carrier is (or will be) waiting when the box lands
      // about four seconds into the shot.
      const want = t + 4 * D.speed;
      let best = null, bd = Infinity;
      for (const sc of sim.scs) {
        const tk = sc.task;
        if (!tk || tk.kind !== 'disch' || tk.attachT < t + 2 * D.speed) continue;
        const d = Math.abs(tk.attachT - 6 - want) + (tk.pickT0 > want ? 60 : 0);
        if (d < bd) { bd = d; best = sc; }
      }
      if (best) {
        D.state.sc = best;
        const st = sim.scG.states[best.task.pickState];
        return { x: st.x, y: st.y };
      }
      const c = sim.cranes.find(q => q.state === 'cycle') || sim.cranes[1];
      return { x: c.x, y: 18 };
    }
    if (shot.pick === 'follow') { const sc = D.state.sc || sim.scs.find(s => s.task); D.state.sc = sc; return sc && sc._draw ? { x: sc._draw.x, y: sc._draw.y } : { x: 300, y: 100 }; }
    if (shot.pick === 'ship') { const call = sim.calls[0]; return { x: call.xAP + call.vessel.hull.L * 0.55, y: 0 }; }
    return {};
  }

  D.update = function (dt) {
    if (!D.on) return;
    D.t += dt;
    if (D.t >= D.length) { D.stop(); TL.UI.camTo(200, 45, 0.25, 0.01); return; }
    let acc = 0, k = 0;
    while (k < SHOTS.length - 1 && D.t >= acc + SHOTS[k].d) { acc += SHOTS[k].d; k++; }
    const shot = SHOTS[k], u = (D.t - acc) / shot.d;
    if (k !== D.shot) {
      D.shot = k; D.from = Object.assign({}, app.r.cam); D.shotT = D.t;
      D.target = choose(shot);
      const cap = $('#caption');
      cap.innerHTML = `${shot.cap[0]}<small>${shot.cap[1]}</small>`;
      cap.style.opacity = 1;
      const ss = document.querySelector('#stabSect');
      if (ss) {
        ss.classList.toggle('glow', shot.pick === 'ship');
        const body = document.querySelector('#pbody');
        if (shot.pick === 'ship') body.scrollTo({ top: ss.offsetTop - 60, behavior: 'smooth' });
        else if (k === 0 || k === SHOTS.length - 1) body.scrollTo({ top: 0, behavior: 'smooth' });
      }
      // While a caption shows, the floating cards step aside (except the
      // carrier the shot is about).
      document.body.classList.toggle('capon', k > 0 && k < SHOTS.length - 1);
      // Close shots fade the panels away; the console returns for the readout.
      document.body.classList.toggle('cine', !!shot.cine);
      $('#demoText').textContent = `Demo tour · ${k + 1} / ${SHOTS.length}`;
    }
    if (shot.pick === 'follow' && D.state.sc && D.state.sc._draw) {
      // Track the carrier, lagging a little like a camera operator.
      const p = D.state.sc._draw;
      D.target.x += (p.x - D.target.x) * Math.min(1, dt * 3);
      D.target.y += (p.y - D.target.y) * Math.min(1, dt * 3);
    }
    if (D.t - acc > shot.d - 0.6) $('#caption').style.opacity = 0;
    const want = shot.cam(u, D.target || {});
    // Blend from wherever the camera was over the first 1.6 s of a shot.
    const b = TL.easeInOut(TL.clamp((D.t - D.shotT) / 1.6, 0, 1));
    const c = app.r.cam;
    c.x = TL.lerp(D.from.x, want.x, b); c.y = TL.lerp(D.from.y, want.y, b);
    c.zoom = Math.exp(TL.lerp(Math.log(D.from.zoom), Math.log(want.zoom), b));
    c.az = TL.lerp(D.from.az, want.az != null ? want.az : -Math.PI / 4, b);
    c.el = TL.lerp(D.from.el, want.el != null ? want.el : 0.62, b);
  };
})(globalThis.TL = globalThis.TL || {});
