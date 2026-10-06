// Layer 7: the zoom view's logic, without a browser: layouts, wiring, the
// trace from a pixel to a transistor, and the camera's continuity.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../src/node.js');
require('../src/scene.js');
const { FW, FH, AREA } = G.layout;

const nl = G.hdl.build('CPU');

test('every chip schematic fits its frame, boxes are 16:10 and do not overlap', () => {
  const seen = new Set();
  for (const inst of nl.insts) {
    if (!inst.children.length || seen.has(inst.type)) continue;
    seen.add(inst.type);
    const { boxes } = G.layout.layoutOf(nl, inst);
    assert.equal(boxes.length, inst.children.length);
    boxes.forEach((b, i) => {
      assert.ok(Math.abs(b.w / b.h - 1.6) < 1e-9, `${inst.type} box ${i} aspect`);
      assert.ok(b.x >= AREA.x0 - 1 && b.x + b.w <= AREA.x1 + 1 && b.y >= AREA.y0 - 1 && b.y + b.h <= AREA.y1 + 1, `${inst.type} box ${i} inside`);
      for (let j = 0; j < i; j++) {
        const c = boxes[j];
        const apart = b.x + b.w <= c.x || c.x + c.w <= b.x || b.y + b.h <= c.y || c.y + c.h <= b.y;
        assert.ok(apart, `${inst.type}: boxes ${j} and ${i} overlap`);
      }
    });
  }
  assert.ok(seen.size >= 20, `${seen.size} chip types laid out`);
});

test('every wire in every chip has a source, and every input bit is driven exactly once', () => {
  for (const inst of nl.insts) {
    if (!inst.children.length) continue;
    const wires = G.layout.wiresOf(nl, inst);
    for (const w of wires) assert.notEqual(w.src.kind, 'outer', `${G.sim.path(nl, inst.children[0].gate ?? 0)}: a wire from outside the chip`);
    // Each (child, port, bit) and each output bit appears in exactly one wire.
    const count = new Map();
    for (const w of wires) w.nets.forEach((n, k) => { const key = w.dst.key; count.set(key, (count.get(key) || 0) + 1); });
    inst.children.forEach((c, i) => G.layout.ports(c).ins.forEach(p => {
      assert.equal(count.get(`c${i}.${p}`), [].concat(c.ins[p]).length, `${inst.type}/${c.label}.${p}`);
    }));
    G.layout.ports(inst).outs.forEach(p => assert.equal(count.get('out:' + p), [].concat(inst.outs[p]).length, `${inst.type} out ${p}`));
  }
});

function playedMachine() {
  const src = fs.readFileSync(path.join(__dirname, '../game/breakout.tin'), 'utf8');
  const c = G.tin.compile(src);
  const m = new G.machine.Machine(c.rom, { netlist: nl });
  m.board.chains = new Map();
  m.board.onScreen = (p, pc) => m.board.chains.set(p, G.trace.callChain(c, m.board.ram, pc));
  for (let f = 0; f < 300; f++) { m.run(2000); m.board.tick++; }
  return { c, m, probe: new G.machine.Probe(nl) };
}

test('the trace: from any drawn pixel to a gate that flipped, and a transistor that conducts', () => {
  const { c, m, probe } = playedMachine();
  let traced = 0;
  for (let p = 0; p < 3072; p += 7) {
    const s = G.trace.select(m, c, p, probe);
    if (!s.record) continue;
    traced++;
    // The instruction is a store, and the CPU really writes this pixel's value to its address.
    assert.equal(s.now[nl.outputs.writeM], 1, `pixel ${p}: writeM`);
    assert.equal(G.sim.getter(nl.outputs.addressM)(s.now), s.address);
    assert.equal(G.sim.getter(nl.outputs.outM)(s.now), s.value);
    // The chosen gate flipped, and the path runs from the CPU down to it.
    const out = nl.gOut[s.gate];
    assert.notEqual(s.before[out], s.now[out], `pixel ${p}: the gate flipped`);
    assert.equal(s.path[0], nl.root);
    assert.equal(s.path[s.path.length - 1].gate, s.gate);
    for (let i = 1; i < s.path.length; i++) assert.equal(s.path[i].parent, s.path[i - 1]);
    // The transistor conducts now, and its kind matches the output.
    const cell = G.transistor.nandCell(s.now[nl.gA[s.gate]], s.now[nl.gB[s.gate]]);
    const t = cell.transistors.find(x => x.name === s.transistor);
    assert.ok(t.on, `pixel ${p}: ${s.transistor} conducts`);
    assert.equal(t.type === 'p', s.now[out] === 1);
    // The source line is a line of the game, and the call chain ends in main.
    assert.ok(s.srcLine >= 1 && s.calls[s.calls.length - 1].name === 'main', `pixel ${p}: ${s.srcLine}`);
  }
  assert.ok(traced > 300, `${traced} pixels traced`);
});

test('the camera is continuous across every level boundary', () => {
  const { c, m, probe } = playedMachine();
  const canvas = { width: 1440, height: 900, getContext: () => ({}) };
  const scene = new G.scene.Scene(canvas, { nl, compiled: c, safe: { x: 340, y: 20, w: 1080, h: 800 } });
  const p = [...m.board.screen].findIndex((v, i) => v === 15 && m.board.log.cycle[i] >= 0);
  scene.setSelection(G.trace.select(m, c, p, probe));
  const L = scene.levels;
  assert.deepEqual(L.map(l => l.short), ['Game', 'Pixel', 'Program', 'CPU', 'ALU', 'Add16', 'FullAdder', 'NAND', 'Transistor']);
  for (let k = 0; k + 1 < L.length; k++) {
    // At the end of level k, the anchor fills the view exactly as level k+1 does at its start.
    const end = scene.inner(scene.transform(k, 1), L[k].anchor);
    const start = scene.transform(k + 1, 0);
    for (const key of ['x', 'y', 's']) assert.ok(Math.abs(end[key] - start[key]) < 1e-6 * Math.max(1, Math.abs(start[key])), `level ${k}: ${key}`);
    // Each step magnifies by a sensible amount.
    const step = 1 / L[k].s;
    assert.ok(step >= 2 && step <= 60, `level ${k} magnifies ${step.toFixed(1)}x`);
  }
  const total = Math.exp(scene.zMax);
  assert.ok(total > 1e6, `total magnification ${total.toExponential(2)}`);
  console.log(`total magnification: ${total.toExponential(2)}`);
});

test('the page embeds the current game source', () => {
  const src = fs.readFileSync(path.join(__dirname, '../game/breakout.tin'), 'utf8');
  const g = {};
  new Function('globalThis', fs.readFileSync(path.join(__dirname, '../src/game.js'), 'utf8'))(Object.assign(g, { G2G: {} }));
  assert.equal(g.G2G.gameSource, src, 'run node tools/embed.js');
});
