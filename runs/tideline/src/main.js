// main.js: boots the console: simulation, renderer, UI, and the clock.
'use strict';
(function (TL) {
  const q = new URLSearchParams(location.search);
  const app = TL.app = {
    speed: 20, paused: false, simT: 0, last: performance.now(), frames: 0,
  };
  function boot() {
    const canvas = document.getElementById('view');
    app.sim = new TL.Sim({ seed: +(q.get('seed') || 1) });
    app.sim.run(+(q.get('warm') || 600));
    app.simT = app.sim.t;
    app.r = new TL.Renderer(canvas);
    app.decals = TL.Decals.build(app.sim);
    if (TL.UI) TL.UI.init(app);
    app.ready = true;
    if (!q.has('still')) requestAnimationFrame(loop);
    else { app.still = true; app.frame(app.simT); }
  }
  // Advance the simulation to time t (seconds) and draw.
  app.frame = function (t) {
    const sim = app.sim;
    while (sim.t + 1 <= t) sim.step();
    app.simT = t;
    const scene = TL.Models.fill(app.r, sim, t);
    scene.decals = TL.Decals.fill(sim, t, app.r.cam);
    app.r.draw(scene, t);
    if (TL.UI) TL.UI.update(app, t);
    app.frames++;
  };
  function loop(now) {
    const dt = Math.min(0.1, (now - app.last) / 1000);
    app.last = now;
    if (!app.paused) app.simT += dt * app.speed;
    TL.Demo.update(dt);
    app.frame(app.simT);
    requestAnimationFrame(loop);
  }
  // Film rendering: advance a fixed slice of real time, deterministically.
  app.filmFrame = function (dtMs) {
    const dt = dtMs / 1000;
    if (!app.paused) app.simT += dt * app.speed;
    TL.Demo.update(dt);
    app.frame(app.simT);
    return { demo: TL.Demo.on, t: TL.Demo.t };
  };
  window.addEventListener('DOMContentLoaded', boot);
})(globalThis.TL = globalThis.TL || {});
