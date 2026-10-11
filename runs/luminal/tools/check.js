// check.js: solve the whole level and report each section's timing windows.
//   node tools/check.js [--from beat] [--to beat]
'use strict';
const L = require('../src/node.js');
const S = require('./solver.js');
const lv = L.buildLevel();
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const fromBeat = arg('--from', 0), toBeat = arg('--to', lv.endBeat);
let start = L.initState(lv);
const t0 = Date.now();
if (fromBeat > 0) {
  const pre = S.solve(lv, start, L.xAt(lv, fromBeat * L.BEAT));
  if (!pre || pre.failed) { console.log('cannot reach start', pre); process.exit(1); }
  start = S.replay(lv, start, pre.inputs);
}
const res = S.solve(lv, start, L.xAt(lv, toBeat * L.BEAT));
if (!res || res.failed) {
  console.log(`FAILED near beat ${(res.t / L.BEAT).toFixed(2)} (x ${res.x.toFixed(1)})`);
  process.exit(1);
}
const end = S.replay(lv, start, res.inputs);
console.log(`solved beats ${fromBeat}-${toBeat} in ${Date.now() - t0} ms; replay: dead=${end.dead} x=${end.x.toFixed(1)} finished=${end.finished}`);
if (process.argv.includes('--windows')) {
  const w = S.windows(lv, start, res.inputs);
  for (const sec of lv.sections) {
    const nxt = lv.sections[lv.sections.indexOf(sec) + 1];
    const inSec = w.filter(e => e.t >= sec.t && (!nxt || e.t < nxt.t));
    if (!inSec.length) continue;
    const ms = inSec.map(e => e.width * 1000).sort((a, b) => a - b);
    console.log(`${sec.name.padEnd(10)} presses ${String(inSec.length).padStart(3)}  min ${ms[0].toFixed(0)} ms  median ${ms[ms.length >> 1].toFixed(0)} ms`);
    for (const e of inSec.filter(e => e.width < 0.06)) console.log(`   tight: beat ${(e.t / L.BEAT).toFixed(2)} ${(e.width * 1000).toFixed(0)} ms (-${e.early}/+${e.late})`);
  }
}
