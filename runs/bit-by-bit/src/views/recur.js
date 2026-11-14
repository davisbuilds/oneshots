// views/recur.js: the tower, the call tree, and the grid of coins.
(() => {
  const { h, range } = BB, D = BB.draw, V = BB.views;
  const top = (a) => a[a.length - 1];

  V.hanoi = (s, c) => {
    const { W, H, ui } = c, out = [], play = s.status === 'play';
    const px = (i) => W * (0.5 + (i - 1) * 0.3), base = H * 0.82, dh = Math.min(34, (H * 0.5) / (s.n + 1));
    const maxW = Math.min(W * 0.27, 210), dw = (k) => 46 + (k / s.n) * (maxW - 46);
    const tap = (i) => () => { if (ui.sel == null) { if (s.pegs[i].length) ui.sel = i; } else if (ui.sel === i) ui.sel = null; else return c.act({ t: 'move', from: ui.sel, to: i }); c.redraw(); };
    range(3).forEach((i) => {
      const hot = c.hot((a) => a.from === i || a.to === i);
      out.push(h('rect', { key: 'zone' + i, class: 'zone' + (play ? ' tap' : '') + (hot ? ' hotz' : ''), x: px(i) - maxW / 2 - 8, y: base - dh * (s.n + 2.4), width: maxW + 16, height: dh * (s.n + 2.4) + 34, rx: 14, onclick: play ? tap(i) : null, tabindex: 0, role: 'button', 'aria-label': `${['Left', 'Middle', 'Right'][i]} peg, ${s.pegs[i].length} discs` }));
      out.push(D.path('peg' + i, `M${px(i)} ${base + dh / 2}L${px(i)} ${base - dh * (s.n + 0.8)}M${px(i) - maxW / 2} ${base + dh / 2 + 3}L${px(i) + maxW / 2} ${base + dh / 2 + 3}`, 'wire'));
      out.push(D.text('pl' + i, px(i), base + dh / 2 + 28, i === 2 ? 'goal' : '', 'dimt', 14));
    });
    s.pegs.forEach((p, i) => p.forEach((k, d) => {
      const lifted = ui.sel === i && d === p.length - 1;
      out.push(D.tile('d' + s.round + '-' + k, px(i), base - d * (dh + 3) - (lifted ? dh * 0.8 : 0), { w: dw(k), h: dh, r: dh / 2, text: k, font: dh * 0.5, cls: 'k' + (k % 7) + (lifted ? ' cur' : '') }));
    }));
    out.push(D.text('info', W / 2, 34, ui.sel == null ? 'Tap a peg to lift its top disc.' : 'Now tap the peg to put it on.', 'dimt', 16));
    return out;
  };

  V.fib = (s, c) => {
    const { W, H } = c, out = [], play = s.status === 'play', P = c.portrait;
    const memoW = s.useMemo ? (P ? 0 : 170) : 0, memoH = s.useMemo && P ? 74 : 0;
    // Tidy layout: leaves spread evenly, each parent above the middle of its children.
    const xs = {}, depth = {}; let leaf = 0, deep = 0;
    const place = (id, d) => { const nd = s.nodes[id]; depth[id] = d; deep = Math.max(deep, d); if (!nd.k) { xs[id] = leaf++; return; } place(nd.k[0], d + 1); place(nd.k[1], d + 1); xs[id] = (xs[nd.k[0]] + xs[nd.k[1]]) / 2; };
    place(0, 0);
    const x0 = 30, wAvail = W - 60 - memoW, gap = wAvail / Math.max(1, leaf), bw = Math.max(34, Math.min(70, gap - 8)), bh = 34;
    const topY = 74 + memoH, stepY = Math.min(72, (H - topY - 60) / Math.max(1, deep));
    const X = (id) => x0 + (xs[id] + 0.5) * gap, Y = (id) => topY + depth[id] * stepY;
    s.nodes.forEach((nd) => { if (nd.p != null) out.push(D.line('e' + s.round + '-' + nd.id, X(nd.p), Y(nd.p), X(nd.id), Y(nd.id), 'wire thin')); });
    s.nodes.forEach((nd) => {
      const open = nd.v == null && !nd.k;
      const cls = (nd.v != null ? (nd.hit ? 'sel' : nd.n < 2 ? 'hid' : 'good') : open ? 'pulse k' + (nd.n % 7) : 'k' + (nd.n % 7)) + (c.hot((a) => a.id === nd.id) ? ' hot' : '');
      out.push(D.tile('n' + s.round + '-' + nd.id, X(nd.id), Y(nd.id), { w: bw, h: bh, r: 12, text: nd.v != null ? nd.v : '?', font: 18, top: bw > 44 ? `fib(${nd.n})` : `f(${nd.n})`, cls, on: open && play ? () => c.act({ t: 'call', id: nd.id }) : null, label: `fib(${nd.n})${nd.v != null ? ' = ' + nd.v : ', not worked out yet'}` }));
    });
    out.push(D.text('info', (W - memoW) / 2, 30, `Calls made: ${s.calls}`, '', 18));
    if (s.useMemo) {
      const known = Object.keys(s.memo).map(Number).sort((a, b) => a - b);
      if (P) { out.push(D.text('ml', 20, 62, 'Notebook:', 'left', 15)); known.forEach((n, i) => out.push(D.tile('m' + n, 130 + i * 58, 86, { w: 54, h: 40, text: s.memo[n], top: `f(${n})`, font: 16, cls: 'sel flat' }))); }
      else { const mx = W - memoW / 2 - 14; out.push(h('rect', { key: 'mb', class: 'panel', x: mx - 74, y: 56, width: 148, height: H - 90, rx: 14 })); out.push(D.text('ml', mx, 84, 'Notebook', '', 17)); known.forEach((n, i) => out.push(D.text('m' + n, mx, 118 + i * 30, `fib(${n}) = ${s.memo[n]}`, 'mono', 15))); if (!known.length) out.push(D.text('me', mx, 118, 'empty', 'dimt', 14)); }
    }
    out.push(D.text('how', (W - memoW) / 2, H - 18, P ? 'Tap a pulsing call to work it out.' : 'Coloured calls are waiting. Tap a pulsing one to work it out.' + (s.useMemo ? ' Yellow came from the notebook.' : ''), 'dimt', P ? 12.5 : 14));
    return out;
  };

  V.grid = (s, c) => {
    const { W, H } = c, out = [], { R, C, g } = s, play = s.status === 'play', walk = s.phase === 'walk';
    const cs = Math.min(92, (W - 50) / C - 8, (H - 150) / R - 8), step = cs + 8;
    const x = (cc) => W / 2 + (cc - (C - 1) / 2) * step, y = (r) => 86 + cs / 2 + r * step + (H - 150 - R * step) / 2;
    const inList = (list, r, cc) => !!list && list.some(([a, b]) => a === r && b === cc);
    const [pr, pc] = s.pos;
    if (!walk) for (let r = 0; r < R; r++) for (let cc = 0; cc < C; cc++) { const f = s.from[r][cc]; if (f) out.push(D.arrow(`ar${r}-${cc}`, x(cc - (f === 'L')), y(r - (f === 'U')), x(cc), y(r), 'wire ' + (inList(s.path, r, cc) ? 'path' : 'thin dimw'), { pad: cs / 2 + 2, pad0: cs / 2 - 2, head: 7 })); }
    for (let r = 0; r < R; r++) for (let cc = 0; cc < C; cc++) {
      let cls = '', on = null, text = g[r][cc], topL = null, label = `Row ${r + 1}, column ${cc + 1}: ${g[r][cc]}`;
      if (walk) {
        if (inList(s.trail, r, cc)) cls = r === pr && cc === pc ? 'cur sel' : 'acc';
        const nextR = r === pr && cc === pc + 1, nextD = r === pr + 1 && cc === pc;
        if (play && (nextR || nextD)) { on = () => c.act({ t: 'step', d: nextR ? 'R' : 'D' }); cls = 'pulse'; if (c.hot((a) => a.d === (nextR ? 'R' : 'D'))) cls += ' hot'; }
      } else {
        const b = s.best[r][cc];
        if (b != null) { text = b; cls = inList(s.path, r, cc) ? 'sel' : 'good'; label += `, best total ${b}`; }
        else {
          const ready = (!r || s.best[r - 1][cc] != null) && (!cc || s.best[r][cc - 1] != null);
          cls = ready ? 'pulse' : 'hid'; if (play) on = () => c.act({ t: 'solve', r, c: cc });
          if (c.hot((a) => a.r === r && a.c === cc)) cls += ' hot';
        }
      }
      const solved = !walk && s.best[r][cc] != null;
      out.push(D.tile(`c${r}-${cc}`, x(cc), y(r), { w: cs, text, font: solved ? cs * 0.36 : cs * 0.4, cls, on, label,
        inner: solved ? h('text', { class: 'top', x: cs / 2 - 14, y: -cs / 2 + 17, text: '+' + g[r][cc] }) : null }));
    }
    const k = s.calc;
    out.push(D.text('info', W / 2, 34, walk ? `Collected so far: ${s.sum}` : s.status === 'won' ? `Best possible: ${s.opt}. Your walk collected ${s.walked}.` : `Your walk: ${s.walked}   ·   Murphy's claim: ${s.opt}`, '', 18));
    out.push(D.text('calc', W / 2, 62, walk ? 'Tap the square to the right, or the one below.' : k ? (k.up == null && k.left == null ? `start: ${k.v}` : `best way in: max(${[k.up != null ? '↑ ' + k.up : null, k.left != null ? '← ' + k.left : null].filter(Boolean).join(', ')}) + ${k.v} = ${k.best}`) : 'Tap a pulsing square to work out the best total that can reach it.', k && !walk ? 'mono' : 'dimt', 15));
    return out;
  };
})();
