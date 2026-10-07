// layout.js: where each chip's parts sit in its schematic, and its wires.
//
// Every chip is drawn in its own frame of 1600 x 1000 units. Inputs enter on
// the left edge, outputs leave on the right, and each child chip is a box with
// the same 16:10 shape, so a child's own schematic fits exactly inside its box
// and its port pins line up with the wires drawn to that box. That is what
// lets the zoom view go down the hierarchy continuously.
'use strict';
(function (G) {
  const FW = 1600, FH = 1000, ASPECT = FW / FH;
  const AREA = { x0: 170, x1: 1430, y0: 50, y1: 950 };

  const pinY = (k, n) => FH * (k + 1) / (n + 1);
  const ports = inst => {
    const spec = G.hdl.CHIPS[inst.type];
    return spec ? { ins: spec.inOrder, outs: spec.outOrder } : { ins: ['a', 'b'], outs: ['out'] };
  };

  // Port pins of a box (in the parent's units) or of the frame itself.
  function pin(box, inst, side, port) {
    const p = ports(inst)[side];
    const k = p.indexOf(port), y = box.y + box.h * (k + 1) / (p.length + 1);
    return { x: side === 'ins' ? box.x : box.x + box.w, y };
  }

  function fitBox(cx, cy, cw, ch, fill = 0.74) {
    let w = Math.min(cw * fill, ch * fill * ASPECT, 560);
    const h = w / ASPECT;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  // Dependencies between the children of one instance.
  function childGraph(nl, inst) {
    const idx = new Map(inst.children.map((c, i) => [c.id, i]));
    const owner = net => {
      const g = nl.driver[net];
      if (g < 0) return -1;
      let i = nl.insts[nl.gInst[g]];
      while (i && i.parent !== inst) i = i.parent;
      return i ? idx.get(i.id) : -1;
    };
    const preds = inst.children.map(c => {
      const s = new Set();
      for (const v of Object.values(c.ins)) for (const n of [].concat(v)) { const o = owner(n); if (o >= 0) s.add(o); }
      return [...s];
    });
    return { preds, owner };
  }

  const typeCache = new Map();

  function layoutOf(nl, inst) {
    const key = inst.type;
    if (typeCache.has(key)) return typeCache.get(key);
    const spec = G.hdl.CHIPS[inst.type] || {};
    const hint = spec.layout || {};
    const n = inst.children.length;
    const boxes = new Array(n);
    const W = AREA.x1 - AREA.x0, H = AREA.y1 - AREA.y0;

    if (hint.place) {
      const cw = W / hint.cols, ch = H / hint.rows;
      inst.children.forEach((c, i) => {
        const [col, row] = hint.place[c.label] || [0, 0];
        boxes[i] = fitBox(AREA.x0 + cw * (col + 0.5), AREA.y0 + ch * (row + 0.5), cw, ch, 0.8);
      });
    } else if (hint.grid) {
      const lead = hint.lead || 0, cols = hint.grid, m = n - lead;
      const rows = Math.ceil(m / cols);
      const leadW = lead ? W * 0.16 : 0;
      const cw = (W - leadW) / cols, ch = H / rows;
      for (let i = 0; i < lead; i++) boxes[i] = fitBox(AREA.x0 + leadW / 2, AREA.y0 + H * (i + 0.5) / lead, leadW, Math.min(H / lead, ch), 0.8);
      for (let k = 0; k < m; k++) {
        const r = Math.floor(k / cols);
        let c = k % cols;
        if (hint.snake && r % 2) c = cols - 1 - c;
        boxes[lead + k] = fitBox(AREA.x0 + leadW + cw * (c + 0.5), AREA.y0 + ch * (r + 0.5), cw, ch, 0.7);
      }
    } else {
      // Columns by longest path from the inputs, ignoring feedback edges.
      const { preds } = childGraph(nl, inst);
      const depth = new Array(n).fill(-1), state = new Array(n).fill(0);
      const visit = i => {
        if (state[i] === 2) return depth[i];
        if (state[i] === 1) return -1;          // a back edge: feedback
        state[i] = 1;
        let d = 0;
        for (const p of preds[i]) { const dp = visit(p); if (dp >= 0) d = Math.max(d, dp + 1); }
        state[i] = 2; depth[i] = d;
        return d;
      };
      for (let i = 0; i < n; i++) visit(i);
      const cols = Math.max(...depth) + 1;
      const byCol = Array.from({ length: cols }, () => []);
      depth.forEach((d, i) => byCol[d].push(i));
      const rowPos = new Array(n).fill(0);
      byCol.forEach((list, c) => {
        if (c > 0) {
          const bary = i => { const ps = preds[i].filter(p => depth[p] < c); return ps.length ? ps.reduce((a, p) => a + rowPos[p], 0) / ps.length : 0.5; };
          list.sort((a, b) => bary(a) - bary(b) || a - b);
        }
        list.forEach((i, r) => { rowPos[i] = (r + 0.5) / list.length; });
      });
      const rows = Math.max(...byCol.map(l => l.length));
      const cw = W / cols, ch = H / rows;
      byCol.forEach((list, c) => list.forEach((i, r) => {
        boxes[i] = fitBox(AREA.x0 + cw * (c + 0.5), AREA.y0 + H * (r + 0.5) / list.length, cw, Math.min(ch, H / list.length), cols === 1 && rows === 1 ? 0.5 : 0.74);
      }));
    }
    const out = { boxes };
    typeCache.set(key, out);
    return out;
  }

  // The wires inside one instance, grouped by (source port, target port).
  // A source is a parent input, a child output, a rail or the clock.
  const wireCache = new Map();
  function wiresOf(nl, inst) {
    if (wireCache.has(inst.id)) return wireCache.get(inst.id);
    const lay = layoutOf(nl, inst);
    const frame = { x: 0, y: 0, w: FW, h: FH };
    const inMap = new Map(), outMap = new Map();
    const ip = ports(inst);
    ip.ins.forEach(p => [].concat(inst.ins[p]).forEach((net, b) => { if (!inMap.has(net)) inMap.set(net, { port: p, bit: b }); }));
    inst.children.forEach((c, i) => ports(c).outs.forEach(p => [].concat(c.outs[p]).forEach((net, b) => { if (!outMap.has(net)) outMap.set(net, { child: i, port: p, bit: b }); })));
    const groups = new Map();
    const add = (src, dst, net) => {
      const k = src.key + '>' + dst.key;
      if (!groups.has(k)) groups.set(k, { src, dst, nets: [] });
      groups.get(k).nets.push(net);
    };
    const source = net => {
      if (inMap.has(net)) { const s = inMap.get(net); return { key: 'in:' + s.port, kind: 'in', port: s.port, at: pin(frame, inst, 'ins', s.port) }; }
      if (outMap.has(net)) { const s = outMap.get(net); return { key: `c${s.child}:${s.port}`, kind: 'child', child: s.child, port: s.port, at: pin(lay.boxes[s.child], inst.children[s.child], 'outs', s.port) }; }
      if (net === 0 || net === 1) return { key: 'rail' + net, kind: 'rail', v: net };
      if (net === 2) return { key: 'clk', kind: 'clk' };
      return { key: 'outer', kind: 'outer' };
    };
    inst.children.forEach((c, i) => ports(c).ins.forEach(p => [].concat(c.ins[p]).forEach(net => {
      const dst = { key: `c${i}.${p}`, kind: 'child', child: i, port: p, at: pin(lay.boxes[i], c, 'ins', p) };
      add(source(net), dst, net);
    })));
    ip.outs.forEach(p => [].concat(inst.outs[p]).forEach(net => {
      add(source(net), { key: 'out:' + p, kind: 'out', port: p, at: pin(frame, inst, 'outs', p) }, net);
    }));
    const wires = [...groups.values()];
    for (const w of wires) if (!w.src.at) w.src.at = { x: w.dst.at.x - 46, y: w.dst.at.y };
    wireCache.set(inst.id, wires);
    return wires;
  }

  G.layout = { FW, FH, ASPECT, AREA, pinY, ports, pin, layoutOf, wiresOf, childGraph };
})(globalThis.G2G || (globalThis.G2G = {}));
