// THRESHOLD: entry point.
import { App } from './game/app.js';
import { runBench, benchTable } from './game/bench.js';

const params = new URLSearchParams(location.search);
const app = new App(document.getElementById('view'), document.getElementById('ui'), params);
if (params.has('bench')) {
  // ?bench[=fast]: measure fixed scenes and print a table (also in window.THR.bench)
  const fast = params.get('bench') === 'fast';
  app.state = 'play'; app.hud.showTitle(false);
  const pre = document.createElement('pre');
  pre.className = 'stats on'; pre.id = 'bench'; pre.style.pointerEvents = 'auto'; pre.style.userSelect = 'text';
  document.getElementById('ui').appendChild(pre);
  pre.textContent = 'Measuring…';
  setTimeout(async () => {
    const results = await runBench(app, fast ? { warm: 4, frames: 12 } : {}, );
    window.THR.bench = results;
    pre.textContent = benchTable(results, app);
  }, 300);
} else {
  if (params.has('play')) app.start(false);
  else if (params.has('demo')) app.start(true);
  else app.hud.showTitle(true);
  app.loop();
}
