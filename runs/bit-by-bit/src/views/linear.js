// views/linear.js: the siding, the bracket tape, two spikes of order slips,
// scattered memory, rewirable lists, and the coat check.
(() => {
  const { h, range } = BB, D = BB.draw, V = BB.views;
  const top = (a) => a[a.length - 1];

  V.shunt = (s, c) => {
    const { W, H } = c, out = [], P = c.portrait;
    // Laid out along a main line (u) with sidings branching off (v); a
    // portrait screen turns the whole yard a quarter turn.
    const U = P ? H : W, cw = Math.max(28, Math.min(52, (U - 250) / 12 - 8)), pitch = cw + 8;
    const v0 = P ? 70 : H * 0.2, uj = U / 2;
    const xy = (u, v) => (P ? { x: v, y: u } : { x: u, y: v });
    const line = (key, u1, v1, u2, v2, cls) => { const a = xy(u1, v1), b = xy(u2, v2); return D.line(key, a.x, a.y, b.x, b.y, cls); };
    const k = s.stacks.length, spur = (i) => uj + (i - (k - 1) / 2) * Math.max(96, cw * 2.1);
    const depth = Math.max(s.want.length, 4) * (cw + 6) + 20;
    out.push(line('tie', 20, v0, U - 20, v0, 'wire tie'), line('rail', 20, v0, U - 20, v0, 'wire rail'));
    range(k).forEach((i) => out.push(line('tie' + i, spur(i), v0 + cw * 0.5, spur(i), v0 + 60 + depth, 'wire tie'), line('rail' + i, spur(i), v0, spur(i), v0 + 60 + depth, 'wire rail')));
    const a0 = xy(20, v0 - cw * 0.5 - 22), a1 = xy(U - 20, v0 - cw * 0.5 - 22);
    out.push(D.text('lin', a0.x + (P ? 0 : 4), a0.y + (P ? 14 : 0), 'arriving', 'dimt left', 13), D.text('lout', a1.x - (P ? 0 : 4), a1.y - (P ? 6 : 0), 'exit', 'dimt ' + (P ? 'left' : 'right'), 13));
    const needCar = s.want[s.out.length];
    // Exit slots show the order the cars must leave in.
    s.want.forEach((v, j) => { const p = xy(U - 34 - cw / 2 - j * pitch, v0); if (j >= s.out.length) out.push(D.tile('want' + j, p.x, p.y, { w: cw, text: v, cls: 'ghost', font: cw * 0.36 })); });
    range(k).forEach((i) => {
      const a = xy(spur(i) - cw * 0.8, v0 + cw * 0.62), b = xy(spur(i) + cw * 0.8, v0 + 66 + depth);
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      out.push(h('rect', { key: 'zone' + i, class: 'zone' + (s.input.length && s.status === 'play' ? ' tap' : '') + (c.hot((m) => m.t === 'push' && m.k === i) ? ' hotz' : ''), x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y), rx: 14,
        onclick: () => c.act({ t: 'push', k: i }), tabindex: 0, role: 'button', 'aria-label': `Siding ${i + 1}: park the next car here` }));
    });
    const car = (v, u, vv, o = {}) => { const p = xy(u, vv); return D.tile('car' + s.round + '-' + v, p.x, p.y, { w: cw, text: v, font: cw * 0.44, cls: 'k' + (v % 7) + ' ' + (o.cls || ''), on: o.on, label: o.label || `Car ${v}` }); };
    s.input.forEach((v, i) => out.push(car(v, uj - k * 48 - 40 - cw / 2 - i * pitch, v0, { cls: i === 0 ? 'cur' : '' })));
    s.out.forEach((v, j) => out.push(car(v, U - 34 - cw / 2 - j * pitch, v0, { cls: 'faint' })));
    s.stacks.forEach((q, i) => q.forEach((v, d) => {
      const isTop = d === q.length - 1;
      out.push(car(v, spur(i), v0 + 62 + (q.length - 1 - d) * (cw + 6) + cw / 2, { cls: isTop && c.hot((m) => m.t === 'pop' && m.k === i) ? 'hot' : '', on: isTop && s.status === 'play' ? () => c.act({ t: 'pop', k: i }) : null, label: `Car ${v}${isTop ? ', top of siding: send it out' : ''}` }));
    }));
    const sig = xy(uj + k * 48 + 46, v0 - cw * 0.5 - 30);
    out.push(D.text('sig', P ? W - 16 : sig.x, P ? H - 14 : sig.y, s.stuck ? 'Jammed. Undo a move.' : `Exit signal waits for car ${needCar}`, P ? 'right' : '', 15));
    return out;
  };

  V.brackets = (s, c) => {
    const { W, H } = c, out = [], P = c.portrait, n = s.toks.length;
    const kind = (t) => ('()'.includes(t) ? 'k0' : '[]'.includes(t) ? 'k1' : 'k2');
    const f = D.flow(n + 1, { x: 30, y: H * 0.07, w: W - 60, h: H * 0.2 }, { max: 58, rows: 1, min: 20 });
    [...s.toks].forEach((t, i) => out.push(D.tile('t' + s.round + '-' + i, f.pos[i].x, f.pos[i].y, { w: f.s, text: t, cls: (i < s.pos ? 'hid faint' : kind(t)) + (i === s.pos ? ' cur' : '') })));
    out.push(D.tile('end' + s.round, f.pos[n].x, f.pos[n].y, { w: f.s, text: 'end', font: f.s * 0.26, cls: 'ghost' + (s.pos >= n ? ' cur' : '') }));
    out.push(D.text('ptr', f.pos[Math.min(s.pos, n)].x, f.pos[0].y + f.s * 0.5 + 24, '▲', 'acc', 18));
    const sx = P ? W * 0.5 : W * 0.3, base = P ? H * 0.64 : H * 0.86, sh = P ? 40 : 48;
    out.push(D.path('cup', `M${sx - 50} ${base - sh * 5.2}L${sx - 50} ${base + sh * 0.5 + 8}L${sx + 50} ${base + sh * 0.5 + 8}L${sx + 50} ${base - sh * 5.2}`, 'wire dimw'));
    out.push(D.text('sl', sx, base + sh * 0.5 + 30, s.stack.length ? 'the stack' : 'the stack (empty)', 'dimt', 14));
    s.stack.forEach((t, i) => out.push(D.tile('s' + s.round + '-' + i, sx, base - i * (sh + 5), { w: 78, h: sh, text: t, cls: kind(t) + (i === s.stack.length - 1 ? ' cur' : '') })));
    const B = [['push', 'Push'], ['pop', 'Pop: it matches'], ['bad', 'Broken!'], ['ok', 'All matched']];
    B.forEach(([t, text], i) => {
      const x = P ? W * (i % 2 ? 0.74 : 0.26) : W * 0.7, y = P ? H * (i < 2 ? 0.8 : 0.9) : H * 0.4 + i * 62;
      out.push(D.btn('b' + t, x, y, text, () => c.act({ t }), { w: P ? 190 : 230, h: 50, cls: (c.hot((a) => a.t === t) ? 'hot ' : '') + (s.status === 'play' ? '' : 'off') }));
    });
    s.verdicts.forEach((v, i) => out.push(D.tile('ver' + i, W - 34 - i * 40, P ? H * 0.31 : H - 34, { w: 32, text: v === 'ok' ? '✓' : '✗', cls: 'flat ' + (v === 'ok' ? 'good' : 'bad') })));
    return out;
  };

  V.twoq = (s, c) => {
    const { W, H } = c, out = [], P = c.portrait;
    const name = (i) => String.fromCharCode(64 + i);
    const xi = W * (P ? 0.2 : 0.26), xo = W * (P ? 0.56 : 0.56), base = H * 0.84, sw = P ? 84 : 104, sh = 38;
    const spike = (x, label, key) => { out.push(D.path(key, `M${x} ${base + sh / 2 + 6}L${x} ${base - sh * 7.6}M${x - sw * 0.6} ${base + sh / 2 + 6}L${x + sw * 0.6} ${base + sh / 2 + 6}`, 'wire dimw')); out.push(D.text(key + 'l', x, base + sh / 2 + 30, label, '', 16)); };
    spike(xi, 'IN', 'spi'); spike(xo, 'OUT', 'spo');
    const slip = (id, x, i, isTop) => D.tile('slip' + id, x, base - i * (sh + 5), { w: sw, h: sh, text: 'order ' + name(id), font: 16, cls: 'k' + (id % 7) + (isTop ? ' cur' : '') });
    s.IN.forEach((id, i) => out.push(slip(id, xi, i, i === s.IN.length - 1)));
    s.OUT.forEach((id, i) => out.push(slip(id, xo, i, i === s.OUT.length - 1)));
    const mx = (xi + xo) / 2, play = s.status === 'play';
    out.push(D.btn('move', mx, H * 0.36, 'Flip  ▸', () => c.act({ t: 'move' }), { w: 108, cls: (c.hot((a) => a.t === 'move') ? 'hot ' : '') + (play && s.IN.length ? '' : 'off') }));
    out.push(D.btn('back', mx, H * 0.36 + 56, '◂  Back', () => c.act({ t: 'back' }), { w: 108, cls: (c.hot((a) => a.t === 'back') ? 'hot ' : '') + (play && s.OUT.length ? '' : 'off') }));
    // The window: who is waiting, and what is still to come.
    const wx = W * (P ? 0.84 : 0.83), wy = H * 0.36;
    out.push(D.text('wl', wx, wy - 62, play ? 'at the window' : 'everyone served', 'dimt', 14));
    if (play) out.push(D.node('cust' + s.nextServe, wx, wy - 18, { r: 28, text: name(s.nextServe), cls: 'sel', label: `Customer waiting for order ${name(s.nextServe)}` }));
    out.push(D.btn('serve', wx, wy + 44, 'Serve', () => c.act({ t: 'serve' }), { w: 108, cls: (c.hot((a) => a.t === 'serve') ? 'hot go ' : 'go ') + (play && s.OUT.length ? '' : 'off') }));
    out.push(D.text('sv', wx, wy + 84, 'hands over the top of OUT', 'dimt', 12));
    const rest = s.script.slice(s.cur + 1), shown = rest.slice(0, P ? 8 : 12);
    out.push(D.text('up', 20, H * 0.08, 'coming up:', 'dimt left', 14));
    shown.forEach((ch, i) => out.push(h('g', { key: 'ev' + (s.cur + 1 + i), class: 'mv', style: D.at(118 + i * 30, H * 0.08 - 5) }, ch === 'i' ? h('rect', { class: 'fill-acc', x: -10, y: -7, width: 20, height: 14, rx: 3 }) : h('circle', { class: 'fill-mus', r: 9 }))));
    out.push(D.text('key', 20, H * 0.08 + 26, '▭ a new order   ● a customer', 'dimt left', 12));
    return out;
  };

  V.walk = (s, c) => {
    const { W, H } = c, out = [], n = s.addrs.length, P = c.portrait;
    const cols = P ? 3 : 4, rows = Math.ceil(n / cols);
    const cw = Math.min(150, (W - 40) / cols - 36), ch = Math.min(92, (H - 60) / rows - 44);
    const gx = cw + 36, gy = ch + 44;
    const pos = (i) => ({ x: W / 2 + ((i % cols) - (cols - 1) / 2) * gx, y: H / 2 + 12 + (Math.floor(i / cols) - (rows - 1) / 2) * gy });
    const at = (k) => pos(s.nodes[k].cell);
    range(n).forEach((i) => {
      const k = s.nodes.findIndex((nd) => nd.cell === i), seen = k >= 0 && s.seen[k], cur = k === s.cur;
      const p = pos(i);
      const nxt = !seen ? null : k === s.nodes.length - 1 ? 'next: null' : `next: ${s.addrs[s.nodes[k + 1].cell]}`;
      out.push(D.tile('cell' + i, p.x, p.y, { w: cw, h: ch, text: seen ? s.nodes[k].v : '', font: ch * 0.34, top: s.addrs[i], cls: (seen ? (cur ? 'cur' : '') : 'hid') + (c.hot((a) => a.cell === i) ? ' hot' : ''),
        inner: seen ? [h('text', { class: 'top', y: ch / 2 - 9, text: nxt }), h('g', { class: 'badge b2', style: D.at(-cw / 2 + 16, -ch / 2 + 16) }, h('circle', { r: 11 }), h('text', { y: 4.5, text: k }))] : null,
        on: !cur && s.status === 'play' ? () => c.act({ t: 'hop', cell: i }) : null, label: seen ? `Item ${k}: ${s.nodes[k].v}, ${nxt}` : `Memory at ${s.addrs[i]}, unknown` }));
    });
    range(s.nodes.length - 1).forEach((k) => {
      if (!s.seen[k] || !s.seen[k + 1]) return;
      const a = at(k), b = at(k + 1), dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const edge = Math.min(Math.abs(dx) > 1 ? (cw / 2) / (Math.abs(dx) / len) : 1e9, Math.abs(dy) > 1 ? (ch / 2) / (Math.abs(dy) / len) : 1e9);
      const far = Math.abs(dx) > gx * 1.5 || Math.abs(dy) > gy * 1.5;
      out.push(D.arrow('ar' + k, a.x, a.y, b.x, b.y, 'wire on over', { pad: edge + 6, pad0: edge + 2, head: 11, bend: far ? 34 : 0 }));
    });
    const hd = at(0);
    out.push(D.tile('head', hd.x + cw / 2 - 30, hd.y - ch / 2 + 15, { w: 50, h: 22, r: 11, text: 'head', font: 13, cls: 'sel flat' }));
    return out;
  };

  V.rewire = (s, c) => {
    const { W, H, ui } = c, out = [], P = c.portrait;
    const row = s.nodes.filter((x) => !x.low), n = row.length;
    const step = Math.min(160, (W - (P ? 60 : 150)) / n), bw = Math.min(78, step * 0.58), bh = 54, y0 = H * 0.5, x0 = W / 2 - (n * step) / 2 + step * 0.36;
    const pos = (nd) => ({ x: Math.max(bw / 2 + 14, x0 + nd.slot * step), y: nd.low ? y0 + 118 : y0 });
    const byId = (id) => s.nodes.find((x) => x.id === id);
    const nullPos = { x: x0 + (n - 0.42) * step + (P ? 0 : 10), y: y0 + (P ? 78 : 0) };
    const play = s.status === 'play', sel = ui.sel;
    const complete = (to) => { const a = sel.t === 'ptr' ? { t: 'ptr', from: sel.from, to } : { t: 'var', name: sel.name, to }; c.act(a); };
    const tapNode = (id) => () => { if (!sel) ui.sel = { t: 'ptr', from: id }; else if (sel.t === 'ptr' && sel.from === id) ui.sel = null; else return complete(id); c.redraw(); };
    const hint = c.hint;
    // Arrows first, so nodes sit on top of them.
    s.nodes.filter((x) => x.alive).forEach((nd) => {
      const p = pos(nd), picked = sel && sel.t === 'ptr' && sel.from === nd.id, cls = 'wire' + (picked ? ' hotw' : '');
      if (nd.next == null) { out.push(D.arrow('ar' + nd.id, p.x + bw / 2 - 6, p.y + 6, p.x + bw / 2 + 16, p.y + bh / 2 + 22, cls + ' thin', { pad: 0, head: 7 })); out.push(D.text('nl' + nd.id, p.x + bw / 2 + 24, p.y + bh / 2 + 42, '∅', 'dimt', 17)); return; }
      const q = pos(byId(nd.next)), dslot = Math.abs(byId(nd.next).slot - nd.slot);
      if (Math.abs(q.y - p.y) > 40) out.push(D.arrow('ar' + nd.id, p.x + (nd.low ? bw / 2 - 8 : 0), p.y + (nd.low ? -bh / 2 : bh / 2), q.x, q.y, cls, { pad: bh / 2 + 5, bend: (q.x > p.x ? -1 : 1) * 16 }));
      else if (q.x > p.x) out.push(D.arrow('ar' + nd.id, p.x + bw / 2 - 6, p.y - (dslot > 1 ? 10 : 0), q.x - bw / 2, q.y - (dslot > 1 ? 16 : 0), cls, { pad: 5, bend: dslot > 1 ? -28 * dslot : 0 }));
      else out.push(D.arrow('ar' + nd.id, p.x + bw / 2 - 12, p.y - bh / 2, q.x, q.y - bh / 2, cls, { pad: 5, bend: 26 + 22 * dslot }));
    });
    s.nodes.filter((x) => x.alive).forEach((nd) => {
      const p = pos(nd);
      const hot = hint && ((hint.t === 'ptr' && (hint.from === nd.id || hint.to === nd.id)) || (hint.t === 'var' && hint.to === nd.id));
      out.push(D.tile('n' + nd.id, p.x, p.y, { w: bw, h: bh, text: nd.v, cls: (nd.low ? 'sel' : '') + (hot ? ' hot' : ''), on: play ? tapNode(nd.id) : null, label: `Node ${nd.v}`,
        inner: h('circle', { class: 'fill-ink', cx: bw / 2 - 9, cy: 0, r: 5 }) }));
    });
    out.push(D.tile('null', nullPos.x, nullPos.y, { w: 70, h: 44, text: 'null', font: 17, cls: 'ghost' + (sel && play ? ' tap' : '') + (hint && hint.to === null ? ' hot' : ''), on: sel && play ? () => complete(null) : null, label: 'null: points at nothing' }));
    // Variables are flags planted on nodes; any that hold null wait on a shelf.
    const stackAt = {};
    Object.keys(s.vars).forEach((name, i) => {
      const id = s.vars[name], nd = id == null ? null : byId(id), fixed = name === 'new';
      let x, y;
      if (nd) { const p = pos(nd), k = stackAt[id] = (stackAt[id] || 0) + 1; x = p.x - 4; y = nd.low ? p.y + bh / 2 + 24 : p.y - bh / 2 - 64 - (k - 1) * 30; if (!nd.low) out.push(D.line('stem' + name, x, y + 12, x, p.y - bh / 2 - 2, 'wire thin dimw')); }
      else { x = nullPos.x; y = nullPos.y - 46 - (stackAt.null = (stackAt.null || 0) + 1) * 30 + 30; }
      const picked = sel && sel.t === 'var' && sel.name === name;
      out.push(D.tile('var' + name, x, y, { w: 62, h: 26, r: 13, text: name, font: 15, cls: (picked ? 'sel' : name === 'head' ? 'acc' : 'k' + (i + 2)) + (hint && hint.t === 'var' && hint.name === name ? ' hot' : ''),
        on: play && !fixed ? () => { ui.sel = picked ? null : { t: 'var', name }; c.redraw(); } : null, label: `Variable ${name}` }));
    });
    out.push(D.text('goal', W / 2, 36, 'Goal: head → ' + s.goal.join(' → '), '', P ? 15 : 18));
    out.push(D.text('how', W / 2, H - 18, !sel ? 'Tap a node to pick up its arrow' + (Object.keys(s.vars).length > 2 ? ', or a label to move it.' : '.') : sel.t === 'ptr' ? `Where should ${byId(sel.from).v} point? Tap a node, or null.` : `Where should ${sel.name} go? Tap a node, or null.`, sel ? 'acc' : 'dimt', P ? 13 : 15));
    return out;
  };

  V.hash = (s, c) => {
    const { W, H } = c, out = [], M = s.table.length, P = c.portrait;
    const f = D.flow(M, { x: 24, y: H * (P ? 0.5 : 0.52), w: W - 48, h: H * 0.34 }, { max: 82, min: 56, vgap: 0.7 });
    const play = s.status === 'play';
    const find = s.phase === 'find';
    range(M).forEach((i) => {
      const v = s.table[i], closed = find && !s.opened.includes(i) && play;
      let cls = closed ? 'hid' : v == null ? 'ghost' : 'k' + (v % 10 % 7);
      if (c.hot((a) => a.i === i)) cls += ' hot';
      if (s.mode === 'murphy' && s.worstKey === v && s.worst > 2) cls += ' cur';
      out.push(D.tile('hook' + i, f.pos[i].x, f.pos[i].y, { w: f.s, text: closed ? '?' : v == null ? '' : v, cls: cls + (s.mode !== 'murphy' && play ? ' tap' : ''), sub: `hook ${i}`,
        on: s.mode !== 'murphy' && play ? () => c.act({ t: 'slot', i }) : null, label: `Hook ${i}${closed ? ', covered' : v == null ? ', empty' : ': coat ' + v}` }));
    });
    out.push(D.text('rule', W / 2, H - 20, 'hook = last digit of the ticket' + (s.mode === 'place' ? '' : ' · if taken, walk right (9 wraps to 0)'), 'dimt', P ? 13 : 15));
    if (s.mode === 'murphy') {
      const pf = D.flow(s.pool.length, { x: 24, y: H * 0.1, w: W - 48, h: H * 0.26 }, { max: 62, min: 50, vgap: 0.3 });
      s.pool.forEach((k, i) => { const used = s.picked.includes(k); out.push(D.tile('p' + k, pf.pos[i].x, pf.pos[i].y, { w: pf.s, h: pf.s * 0.74, text: k, cls: (used ? 'hid dim' : '') + (c.hot((a) => a.k === k) ? ' hot' : ''), on: !used && play ? () => c.act({ t: 'pick', k }) : null, label: `Ticket ${k}` })); });
      out.push(D.text('worst', W / 2, H * 0.4, s.picked.length ? `Slowest coat to find: ${s.worstKey}, ${s.worst} ${s.worst === 1 ? 'look' : 'looks'}  ·  ${s.need - s.picked.length} left to hang` : `Choose ${s.need} tickets`, '', P ? 15 : 18));
      return out;
    }
    const ticket = find ? s.q : s.k;
    if (ticket != null && play) {
      out.push(D.text('cap', W / 2, H * 0.1, find ? 'looking for ticket' : 'next coat', 'dimt', 15));
      out.push(D.tile('tk' + (find ? 'q' : '') + ticket, W / 2, H * 0.22, { w: 96, h: 66, text: ticket, cls: 'sel' }));
      if (!find && s.queue.length > 1) out.push(D.text('more', W / 2, H * 0.22 + 56, `then ${s.queue.slice(1).join(', ')}`, 'dimt', 14));
    }
    return out;
  };
})();
