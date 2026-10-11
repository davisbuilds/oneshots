// fairness.js: replay the stored route and measure, for every press, how
// early or late it could have been and still survived the next 1.2 s.
//   node tools/fairness.js [--all]
'use strict';
const L = require('../src/node.js');
require('../src/route.js');
const S = require('./solver.js');
const lv = L.buildLevel();
const start = L.initState(lv);
// A person taps once per cube jump rather than holding: rebuild the cube
// parts of the route as one short tap at each jump or orb.
function taps(route) {
  const s = L.initState(lv), ev = [];
  const jumps = [], modeAt = [];
  for (let n = 0; n < route.length && !s.finished && !s.dead; n++) {
    modeAt[n] = s.mode; ev.length = 0;
    L.step(lv, s, !!route[n], ev);
    for (const e of ev) if (e.type === 'jump' || e.type === 'orb') jumps.push(n);
  }
  const out = Uint8Array.from(route);
  for (let n = 0; n < out.length; n++) if (modeAt[n] === 'cube') out[n] = 0;
  for (const n of jumps) if (modeAt[n] === 'cube') {
    // the press must begin on or before the step the jump happened
    let a = n; while (a > 0 && route[a - 1] && modeAt[a - 1] === 'cube' && n - a < 2) a--;
    out.fill(1, a, Math.min(out.length, n + 3));
  }
  return out;
}
const human = taps(L.route);
{
  const s = L.initState(lv);
  L.simulate(lv, s, human, human.length + 600);
  console.log(`tap route: ${s.finished ? 'finishes' : 'FAILS at beat ' + (s.t / L.BEAT).toFixed(2) + ' (' + s.cause + ')'}`);
}
const w = S.windows(lv, start, human, { horizon: 1.2, maxShift: 40 });
const all = process.argv.includes('--all');
for (let i = 0; i < lv.sections.length; i++) {
  const sec = lv.sections[i], nxt = lv.sections[i + 1];
  const inSec = w.filter(e => e.t >= sec.t && (!nxt || e.t < nxt.t));
  if (!inSec.length) continue;
  const ms = inSec.map(e => e.width * 1000).sort((a, b) => a - b);
  console.log(`${sec.name.padEnd(10)} presses ${String(inSec.length).padStart(3)}  min ${ms[0].toFixed(0).padStart(4)} ms  10th pct ${ms[Math.floor(ms.length * 0.1)].toFixed(0).padStart(4)} ms  median ${ms[ms.length >> 1].toFixed(0).padStart(4)} ms`);
  for (const e of inSec.filter(e => all || e.width < 0.075)) console.log(`   beat ${(e.t / L.BEAT).toFixed(2).padStart(7)}  ${(e.width * 1000).toFixed(0).padStart(4)} ms  (-${e.early}/+${e.late} steps)`);
}
