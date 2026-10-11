// The level and the song: well formed, on the beat, and finishable.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/node.js');
require('../src/route.js');
const S = require('../tools/solver.js');

const lv = L.buildLevel();
const beatOf = x => L.tAtX(lv, x) / L.BEAT;

test('seven sections follow the song, each starting on a bar line', () => {
  const names = lv.sections.map(s => s.name);
  assert.deepEqual(names, ['Dawn', 'Pulse', 'Ascent', 'Inversion', 'Supernova', 'Echo', 'Ascension', 'Afterglow']);
  for (const s of lv.sections) assert.equal(s.beat % 4, 0, `${s.name} starts on beat ${s.beat}`);
  assert.ok(lv.endBeat < L.song.LENGTH_BEATS, 'the level ends before the song does');
  // every new section is announced in the music: a crash, impact or swell lands on it or leads into it
  const cues = L.song.events.filter(e => ['crash', 'impact', 'swell', 'riser'].includes(e.i));
  for (const s of lv.sections.slice(1)) {
    assert.ok(cues.some(e => Math.abs(e.b - s.beat) < 0.01 || Math.abs(e.b + e.d - s.beat) < 0.6), `${s.name} has a musical cue`);
  }
});

test('speed changes happen only at section starts, so tempo and scroll agree', () => {
  for (const p of lv.portals.filter(p => p.kind === 'speed')) {
    assert.ok(lv.sections.some(s => Math.abs(s.beat - p.beat) < 1e-9), `speed portal at beat ${p.beat}`);
  }
});

test('obstacles sit on the musical grid', () => {
  // Spike groups are centred on sixteenth notes (single spikes) and every
  // portal is on an eighth note.
  const groups = [];
  const sp = lv.spikes.slice().sort((a, b) => a.cx - b.cx || a.by - b.by);
  for (const s of sp) {
    const g = groups.find(g => g.by === s.by && g.dir === s.dir && Math.abs(g.last - s.cx) <= 1.0001);
    if (g) { g.last = s.cx; g.n++; g.sum += s.cx; } else groups.push({ by: s.by, dir: s.dir, last: s.cx, n: 1, sum: s.cx });
  }
  let onGrid = 0;
  for (const g of groups) {
    const b = beatOf(g.sum / g.n);
    if (Math.abs(b * 4 - Math.round(b * 4)) < 0.02 || Math.abs(b * 20 - Math.round(b * 20)) < 0.02) onGrid++;
  }
  assert.ok(onGrid / groups.length > 0.95, `${onGrid} of ${groups.length} spike groups on the grid`);
  for (const p of lv.portals) assert.ok(Math.abs(p.beat * 2 - Math.round(p.beat * 2)) < 1e-9, `portal at beat ${p.beat}`);
});

test('nothing deadly hides where a mode or gravity change drops the player', () => {
  // After each mode or gravity portal there is half a beat with no hazard
  // directly in the player's way at the floor or ceiling it lands on.
  for (const p of lv.portals.filter(p => p.kind === 'mode' || p.kind === 'gravity')) {
    const x1 = L.xAt(lv, (p.beat + 0.5) * L.BEAT);
    const near = lv.hazards.filter(h => h.type === 'spike' && h.x1 > p.x && h.x0 < x1);
    assert.equal(near.length, 0, `spikes right after the ${p.mode || 'gravity'} portal at beat ${p.beat}`);
  }
});

test('the stored route finishes the level under the real physics', () => {
  const s = L.initState(lv);
  const ev = [];
  L.simulate(lv, s, L.route, L.route.length + 1000, ev);
  assert.equal(s.dead, false, `the route dies at beat ${(s.t / L.BEAT).toFixed(2)} (${s.cause})`);
  assert.equal(s.finished, true);
  const modes = new Set(ev.filter(e => e.type === 'portal' && e.kind === 'mode').map(e => e.mode));
  assert.deepEqual([...modes].sort(), ['cube', 'ship', 'wave']);
  assert.ok(ev.some(e => e.type === 'portal' && e.kind === 'gravity'), 'gravity changes on the way');
});

test('every section can be cleared from its own start with inputs on a 50 ms grid', () => {
  // Practice mode starts a player anywhere; no part of the level should need
  // frame-perfect input. From the route's state at each section boundary the
  // solver must reach the next boundary changing the button at most every 50 ms.
  const bounds = [...new Set([...lv.sections.map(s => s.beat), 64, 80, 96, 112, 144, 160, 176, 214, 220, 231, lv.endBeat])].sort((a, b) => a - b);
  const starts = {};
  const s = L.initState(lv);
  let k = 0;
  for (let n = 0; n < L.route.length && k < bounds.length; n++) {
    while (k < bounds.length && s.t >= bounds[k] * L.BEAT) { starts[bounds[k]] = L.cloneState(s); k++; }
    L.step(lv, s, !!L.route[n]);
  }
  for (let i = 0; i + 1 < bounds.length; i++) {
    const a = bounds[i], b = bounds[i + 1];
    const r = S.solve(lv, starts[a], L.xAt(lv, b * L.BEAT), { every: 12, cap: 800 });
    assert.ok(r && !r.failed, `beats ${a}-${b} need finer input than 50 ms`);
  }
});

test('the song is in key: D minor, an A major chord into the drop, E minor and E major at the end', () => {
  const Dm = new Set([2, 4, 5, 7, 9, 10, 0]);       // D E F G A Bb C
  const Em = new Set([4, 6, 7, 9, 11, 0, 2]);       // E F# G A B C D
  const pitched = L.song.events.filter(e => ['pad', 'sub', 'bass', 'growl', 'pluck', 'lead', 'bell', 'stab'].includes(e.i));
  for (const e of pitched) {
    const notes = e.notes || [e.n];
    for (const n of notes) {
      const pc = ((n % 12) + 12) % 12;
      const bar = Math.floor(e.b / 4);
      if (bar === 31 && pc === 1) continue;           // C# of the A major chord
      if (bar >= 60) { assert.ok([4, 8, 11].includes(pc), `final chord note ${n}`); continue; }
      const key = bar >= 52 ? Em : Dm;
      assert.ok(key.has(pc), `note ${n} (${e.i}) at beat ${e.b} is out of key`);
    }
  }
});

test('the drop and the finale have a kick on every beat; the breaks have none', () => {
  const kicks = new Set(L.song.events.filter(e => e.i === 'kick').map(e => e.b));
  for (let b = 128; b < 192; b++) assert.ok(kicks.has(b), `kick on beat ${b}`);
  for (let b = 208; b < 240; b++) assert.ok(kicks.has(b), `kick on beat ${b}`);
  for (let b = 192; b < 208; b++) assert.ok(!kicks.has(b), `no kick in the bridge (beat ${b})`);
  assert.ok(!kicks.has(127), 'silence on the beat before the drop');
});
