// views/sort.js: bars to swap, crates on a scale, merging belts, pivots.
(() => {
  const { h, range } = BB, D = BB.draw, V = BB.views;

  V.swaps = (s, c) => {
    const { W, H, ui } = c, out = [], n = s.arr.length, adj = s.mode === 'adjacent';
    const f = D.flow(n, { x: 40, y: 0, w: W - 80, h: H }, { max: 92, min: 30, gap: adj ? 0.5 : 0.22, rows: 1 });
    const base = H * 0.78, maxH = H * 0.5, minH = 56;
    const pick = (i) => () => { if (ui.sel == null) ui.sel = i; else if (ui.sel === i) ui.sel = null; else return c.act({ t: 'swap', i: ui.sel, j: i }); c.redraw(); };
    out.push(D.line('floor', 30, base + 4, W - 30, base + 4, 'wire dimw'));
    s.arr.forEach((v, i) => {
      const bh = minH + ((v - 1) / (n - 1)) * (maxH - minH);
      const home = v === i + 1;
      let cls = home ? 'good' : '';
      if (ui.sel === i) cls = 'sel';
      if (c.hot((a) => a.i === i || a.j === i)) cls += ' hot';
      out.push(D.tile('v' + v, f.pos[i].x, base - bh / 2, { w: f.s, h: bh, text: v, font: Math.min(30, f.s * 0.5), cls, on: !adj && s.status === 'play' ? pick(i) : null, label: `${v}, position ${i + 1}` }));
    });
    if (adj) range(n - 1).forEach((i) => out.push(D.tile('sw' + i, (f.pos[i].x + f.pos[i + 1].x) / 2, base + 46, { w: Math.min(54, f.stepX - 12), h: 40, r: 20, text: '⇄', font: 22, cls: 'btn' + (c.hot((a) => a.i === i) ? ' hot' : '') + (s.status === 'play' ? '' : ' off'), on: () => c.act({ t: 'swap', i, j: i + 1 }), label: `Swap ${s.arr[i]} and ${s.arr[i + 1]}` })));
    const off = s.arr.filter((v, i) => v !== i + 1).length;
    out.push(D.text('info', W / 2, H * 0.1, adj ? `Out-of-order pairs: ${s.inv}` : `Tiles out of place: ${off}`, '', 19));
    if (!adj) out.push(D.text('how', W / 2, H - 20, ui.sel == null ? 'Tap a tile, then the tile to swap it with.' : `Now tap the tile to swap with ${s.arr[ui.sel]}.`, 'dimt', 15));
    return out;
  };

  V.scale = (s, c) => {
    const { W, H, ui } = c, out = [], n = s.n, P = c.portrait;
    const name = (i) => String.fromCharCode(65 + i);
    const lt = (a, b) => s.lt[a * n + b];
    const area = P ? { x: 20, y: 44, w: W - 40, h: H * 0.56 } : { x: 20, y: 44, w: W * 0.6, h: H - 80 };
    // Rank = length of the longest known chain of lighter crates beneath.
    const below = range(n, (a) => range(n).filter((b) => lt(b, a)));
    const rank = Array(n).fill(0);
    range(n).sort((a, b) => below[a].length - below[b].length).forEach((a) => { rank[a] = below[a].length ? 1 + Math.max(...below[a].map((b) => rank[b])) : 0; });
    const top = Math.max(...rank), size = Math.min(58, area.w / (n + 1.5));
    const stepY = Math.min(84, (area.h - size - 30) / Math.max(1, top));
    const pos = [];
    for (let r = 0; r <= top; r++) {
      const row = range(n).filter((a) => rank[a] === r);
      row.forEach((a, k) => { pos[a] = { x: area.x + area.w * ((k + 1) / (row.length + 1)), y: area.y + area.h - size / 2 - 10 - r * stepY }; });
    }
    out.push(D.text('axis', area.x + 12, area.y + 4, '↑ heavier', 'dimt left', 14));
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (lt(a, b) && !range(n).some((k) => lt(a, k) && lt(k, b))) out.push(D.line(`e${a}-${b}`, pos[a].x, pos[a].y, pos[b].x, pos[b].y, 'wire'));
    const unbeaten = range(n).filter((a) => !range(n).some((b) => lt(a, b)));
    const pick = (a) => () => { if (ui.sel == null) ui.sel = a; else if (ui.sel === a) ui.sel = null; else return c.act({ t: 'cmp', a: ui.sel, b: a }); c.redraw(); };
    range(n).forEach((a) => {
      let cls = 'k' + (a % 7);
      if (s.goal === 'max' && !unbeaten.includes(a)) cls = 'hid faint';
      if (s.champ === a || (s.status === 'won' && s.goal === 'sort')) cls = 'good';
      if (ui.sel === a) cls = 'sel';
      if (c.hot((x) => x.a === a || x.b === a)) cls += ' hot';
      out.push(D.tile('c' + a, pos[a].x, pos[a].y, { w: size, text: name(a), cls, on: s.status === 'play' ? pick(a) : null, label: `Crate ${name(a)}` }));
    });
    // The scale itself, showing the latest weighing (or the crate being held).
    const sx = P ? W / 2 : W * 0.81, sy = P ? H * 0.8 : H * 0.52, arm = P ? 96 : 108;
    const L = s.last, held = ui.sel != null;
    const tilt = held || !L ? 0 : (L.heavy === L.a ? -1 : 1) * 0.2;
    const lx = sx - arm * Math.cos(tilt), ly = sy - arm * Math.sin(-tilt) * -1, rx = sx + arm * Math.cos(tilt), ry = sy + arm * Math.sin(tilt);
    const lyy = sy - arm * Math.sin(tilt);
    out.push(D.path('post', `M${sx} ${sy}L${sx} ${sy + 92}M${sx - 46} ${sy + 92}L${sx + 46} ${sy + 92}`, 'wire'));
    out.push(D.line('beam', lx, lyy, rx, ry, 'wire'));
    out.push(D.path('panL', `M${lx - 34} ${lyy + 44}L${lx + 34} ${lyy + 44}M${lx - 30} ${lyy + 44}L${lx} ${lyy}L${lx + 30} ${lyy + 44}`, 'wire thin'));
    out.push(D.path('panR', `M${rx - 34} ${ry + 44}L${rx + 34} ${ry + 44}M${rx - 30} ${ry + 44}L${rx} ${ry}L${rx + 30} ${ry + 44}`, 'wire thin'));
    const onL = held ? ui.sel : L ? L.a : null, onR = held ? null : L ? L.b : null;
    if (onL != null) out.push(D.tile('panLc', lx, lyy + 22, { w: 40, text: name(onL), cls: 'flat k' + (onL % 7) }));
    if (onR != null) out.push(D.tile('panRc', rx, ry + 22, { w: 40, text: name(onR), cls: 'flat k' + (onR % 7) }));
    out.push(D.text('verdict', sx, sy + 122, held ? `Weigh ${name(ui.sel)} against…` : L ? `${name(L.heavy)} is heavier than ${name(L.heavy === L.a ? L.b : L.a)}` : 'Tap two crates to weigh them', L || held ? '' : 'dimt', 16));
    out.push(D.text('count', sx, P ? H * 0.66 : 64, s.goal === 'max' ? `Never beaten: ${unbeaten.length}` : `Orders still possible: ${BB.poset.extensions(s.lt, n)}`, '', 18));
    return out;
  };

  V.merge = (s, c) => {
    const { W, H } = c, out = [], cx = W / 2;
    const t = Math.min(56, (W - 40) / 9.6), step = t * 1.14, small = 0.7;
    const key = (v) => `m${s.round}-${v}`;
    const bands = { wait: H * 0.13, work: H * 0.4, out: H * 0.66, done: H * 0.9 };
    const runs = (list, y, tag) => {
      const total = list.reduce((a, r) => a + r.length, 0), gaps = Math.max(0, list.length - 1);
      const st = step * small, gap = t * 0.5;
      let x = cx - (total * st + gaps * gap) / 2 + st / 2;
      list.forEach((r) => { r.forEach((v) => { out.push(D.tile(key(v), x, y, { w: t, text: v, k: small, cls: tag })); x += st; }); x += gap; });
    };
    out.push(D.text('l1', 16, bands.wait - t * 0.55, s.runs.length ? 'waiting' : '', 'dimt left', 13), D.text('l2', 16, bands.work - t * 0.85, s.active ? 'compare the two fronts' : '', 'dimt left', 13),
      D.text('l3', 16, bands.out - t * 0.85, s.active ? 'merged so far' : '', 'dimt left', 13), D.text('l4', 16, bands.done - t * 0.55, s.next.length || s.status === 'won' ? 'sorted rows' : '', 'dimt left', 13));
    runs(s.runs, bands.wait, '');
    runs(s.status === 'won' ? [s.result] : s.next, bands.done, 'good');
    if (s.active) {
      const gap = t * 0.95;
      const side = (list, dir, name) => list.forEach((v, i) => {
        const head = i === 0;
        out.push(D.tile(key(v), cx + dir * (gap + i * step), bands.work, { w: t, text: v, cls: head ? 'cur' + (c.hot((a) => a.side === name) ? ' hot' : '') : '', on: head ? () => c.act({ t: 'pick', side: name }) : null, label: head ? `Take ${v}` : String(v) }));
      });
      side(s.L, -1, 'L'); side(s.R, 1, 'R');
      out.push(D.text('vs', cx, bands.work + 6, s.L.length && s.R.length ? '?' : '', 'dimt', 22));
      const total = s.L.length + s.R.length + s.out.length;
      range(total).forEach((i) => out.push(D.tile('slot' + i, cx + (i - (total - 1) / 2) * step, bands.out, { w: t, cls: 'ghost' })));
      s.out.forEach((v, i) => out.push(D.tile(key(v), cx + (i - (total - 1) / 2) * step, bands.out, { w: t, text: v, cls: 'acc' })));
    }
    return out;
  };

  V.pivot = (s, c) => {
    const { W, H } = c, out = [], n = s.arr.length;
    const size = Math.min(54, (W - 30) / n / 1.12), step = size * 1.12, x0 = W / 2 - ((n - 1) * step) / 2;
    const deep = Math.max(1, ...s.arr.map((t) => t.d)), top = 70 + size / 2;
    const dy = Math.min(62, (H - top - size - 46) / deep);
    s.segs.forEach((g, k) => out.push(D.line(`seg${g.lo}-${g.hi}-${g.d}`, x0 + g.lo * step - size / 2, top + g.d * dy + size / 2 + 9, x0 + g.hi * step + size / 2, top + g.d * dy + size / 2 + 9, 'wire on')));
    s.arr.forEach((t, i) => {
      const live = s.segs.some((g) => i >= g.lo && i <= g.hi);
      out.push(D.tile('v' + t.v, x0 + i * step, top + t.d * dy, { w: size, text: t.v, cls: (t.fixed ? 'good flat' : '') + (c.hot((a) => a.i === i) ? ' hot' : ''), on: live && s.status === 'play' ? () => c.act({ t: 'pivot', i }) : null, label: `${t.v}${t.fixed ? ', in place' : ''}` }));
    });
    const p = s.lastPivot;
    out.push(D.text('info', W / 2, 34, p ? `Pivot ${p.v} split its group ${p.left} | ${p.right}` : 'Tap any tile in an underlined group to make it the pivot.', p ? '' : 'dimt', 17));
    out.push(D.text('how', W / 2, H - 16, 'Green tiles are in their final place. Deeper rows are smaller sub-problems.', 'dimt', c.portrait ? 12.5 : 14));
    return out;
  };
})();
