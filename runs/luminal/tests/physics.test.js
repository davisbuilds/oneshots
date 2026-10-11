// The physics, checked against what the design promises: one-beat jumps,
// honest hitboxes, forgiving landings, gravity, the ship and the wave.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/node.js');

// A tiny level made with the real builder.
function level(f, endBeat = 40) {
  const b = L.LevelBuilder();
  b.section(0, 'Test', 'dawn');
  if (f) f(b);
  b.finish(endBeat);
  return L.compile(b.lv);
}
const BEAT_STEPS = Math.round(L.BEAT / L.DT);   // 112.5 -> 112 or 113
const run = (lv, s, input, steps, ev) => { for (let i = 0; i < steps && !s.dead && !s.finished; i++) L.step(lv, s, typeof input === 'function' ? input(i, s) : input, ev); return s; };

test('a ground jump lasts one beat and peaks at 2.2 blocks', () => {
  const lv = level();
  const s = L.initState(lv);
  const ev = [];
  let peak = 0, n = 0, landed = -1;
  for (; n < 200; n++) {
    L.step(lv, s, n < 3, ev);
    peak = Math.max(peak, s.y - 0.5);
    if (n > 5 && s.grounded && landed < 0) landed = n;
  }
  assert.ok(Math.abs(peak - 2.2) < 0.03, `apex ${peak.toFixed(3)}`);
  assert.ok(Math.abs(landed - L.BEAT / L.DT) <= 2, `airtime ${landed} steps, a beat is ${(L.BEAT / L.DT).toFixed(1)}`);
});

test('holding the button bounces on every beat', () => {
  const lv = level();
  const s = L.initState(lv);
  const ev = [];
  run(lv, s, true, Math.round(8 * L.BEAT / L.DT) + 5, ev);
  const jumps = ev.filter(e => e.type === 'jump').map(e => e.t / L.BEAT);
  assert.ok(jumps.length >= 8);
  jumps.forEach((b, i) => assert.ok(Math.abs(b - i) < 0.04, `jump ${i} at beat ${b.toFixed(3)}`));
});

test('a spike kills only when the player really overlaps the drawn triangle', () => {
  // Walk at fixed heights past a spike and record survival.
  const lv = level(b => b.spikes(4));
  const spike = lv.spikes[0];
  for (let h = 0; h < 1.2; h += 0.05) {
    const s = L.initState(lv);
    let dead = false;
    for (let i = 0; i < 3000 && s.x < spike.cx + 2; i++) {
      L.step(lv, s, false);
      s.y = 0.5 + h; s.vy = 0;            // hold the cube at height h
      if (s.dead) { dead = true; break; }
    }
    if (dead) {
      // the box's bottom corners at death must be inside the triangle
      const bottom = s.y - 0.5;
      const halfAt = 0.5 * (1 - bottom / spike.h);
      const dx = Math.max(0, Math.abs(s.x - spike.cx) - 0.5);
      assert.ok(bottom < spike.h && dx < halfAt, `death at height ${h.toFixed(2)} is outside the drawn spike`);
    }
    if (h >= 0.5) assert.equal(dead, false, `clearing by ${h.toFixed(2)} blocks must survive`);
    if (h < 0.4) assert.equal(dead, true, `${h.toFixed(2)} blocks up must hit the spike`);
  }
});

test('blocks: running into a side kills, a shallow landing snaps on top', () => {
  const lv = level(b => b.block(b.at(2), b.at(6), 0, 1));
  const s = run(lv, L.initState(lv), false, 600);
  assert.equal(s.dead, true);
  assert.equal(s.cause, 'wall');
  // land on the edge with the feet 0.3 blocks below the top
  const s2 = L.initState(lv);
  run(lv, s2, false, Math.round(1.9 * BEAT_STEPS));
  s2.y = 1 + 0.5 - 0.3; s2.vy = -2;
  run(lv, s2, false, 30);
  assert.equal(s2.dead, false);
  assert.ok(Math.abs(s2.y - 1.5) < 1e-6 && s2.grounded, 'snapped onto the block');
});

test('a jump pressed slightly before landing still happens (buffer), and just after an edge (coyote)', () => {
  const lv = level();
  const s = L.initState(lv);
  run(lv, s, n => n < 2, 20);
  // tap 15 ms before the landing, release before it lands
  const ev = [];
  let landN = -1;
  for (let n = 0; n < 200; n++) {
    const before = s.y - 0.5;
    const tap = before > 0 && before < 0.25 && s.vy < 0 && landN < 0;
    L.step(lv, s, tap, ev);
    if (tap) landN = n;
  }
  assert.equal(ev.filter(e => e.type === 'jump').length, 1, 'the buffered tap jumped on landing');

  const lv2 = level(b => b.block(0, b.at(2), 0, 1));
  const s2 = L.initState(lv2);
  s2.y = 1.5;
  run(lv2, s2, false, 400);
  const off = L.initState(lv2); off.y = 1.5;
  let stepsAfterEdge = 0;
  const ev2 = [];
  for (let n = 0; n < 600; n++) {
    const press = !off.grounded && off.x > L.xAt(lv2, 2 * L.BEAT) && stepsAfterEdge++ === 6;
    L.step(lv2, off, press, ev2);
  }
  assert.ok(ev2.some(e => e.type === 'jump'), 'a press 25 ms after leaving the edge jumps');
});

test('orbs need a press; holding through one does nothing', () => {
  const lv = level(b => b.orb(2, 0.5));
  const held = L.initState(lv);
  held.held = true;
  const ev = [];
  run(lv, held, true, 400, ev);
  assert.ok(!ev.some(e => e.type === 'orb'), 'no orb without a fresh press');
  const lv2 = level(b => b.orb(2, 2.7));
  const s = L.initState(lv2);
  const ev2 = [];
  // jump on beat 1.5, press again at the orb's beat
  const near = (st, beat) => Math.abs(st.t - beat * L.BEAT) < 0.012;
  run(lv2, s, (n, st) => near(st, 1.5) || near(st, 2.0), 600, ev2);
  assert.ok(ev2.some(e => e.type === 'orb'), 'a press in the air at the orb uses it');
});

test('gravity portals flip the cube onto the ceiling, and it jumps downward', () => {
  const lv = level(b => { b.bounds(0.5, { ceil: 9 }); b.gravity(1, -1); });
  const s = run(lv, L.initState(lv), false, 400);
  assert.equal(s.grav, -1);
  assert.ok(Math.abs(s.y - 8.5) < 1e-6 && s.grounded, 'standing on the ceiling');
  run(lv, s, true, 20);
  assert.ok(s.y < 8.4 && s.vy < 0, 'a jump goes down');
});

test('the ship climbs while held, sinks when released, and slides on the ceiling', () => {
  const lv = level(b => b.mode(0.2, 'ship', { ceil: 9 }));
  const s = run(lv, L.initState(lv), true, 300);
  assert.equal(s.mode, 'ship');
  assert.ok(Math.abs(s.y - (9 - L.PHYS.box.ship[1])) < 1e-6, 'pressed against the ceiling, alive');
  run(lv, s, false, 120);
  assert.ok(s.y < 6 && !s.dead);
});

test('the wave flies at 45 degrees at every speed', () => {
  for (const sp of ['normal', 'fast', 'rush']) {
    const lv = level(b => { b.speed(0.1, sp); b.mode(0.2, 'wave', { ceil: 30 }); });
    const s = run(lv, L.initState(lv), false, 60);
    const x0 = s.x, y0 = s.y;
    run(lv, s, true, 40);
    assert.ok(Math.abs((s.y - y0) / (s.x - x0) - 1) < 0.02, `${sp}: slope ${((s.y - y0) / (s.x - x0)).toFixed(3)}`);
  }
});

test('x is a pure function of time, so the world stays on the beat', () => {
  const lv = L.buildLevel();
  const s = L.initState(lv);
  for (let n = 0; n < 20000; n++) L.step(lv, s, !!(L.route && L.route[n]));
  for (const t of [0, 10, 30.3, 60.1, 90, 110]) {
    const x = L.xAt(lv, t);
    assert.ok(Math.abs(L.tAtX(lv, x) - t) < 1e-9);
  }
  // segments join without jumps
  lv.speedSegs.forEach((sg, i) => { if (i) assert.ok(Math.abs(L.xAt(lv, sg.t - 1e-9) - sg.x) < 1e-6); });
});
