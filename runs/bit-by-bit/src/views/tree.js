// views/tree.js: search trees and heaps.
(() => {
  const { h, range } = BB, D = BB.draw, V = BB.views;
  const T = BB.T;

  V.bst = (s, c) => {
    const { W, H } = c, out = [], t = s.t, P = c.portrait, play = s.status === 'play';
    const n = s.all.length, r = Math.min(26, (W - 60) / n / 2.3);
    const bottom = s.mode === 'rotate' ? 46 : 112, topY = s.mode === 'insert' ? 104 : 74;
    const depthOf = {}; const walk = (k, d) => { if (k == null) return; depthOf[k] = d; walk(t.n[k].l, d + 1); walk(t.n[k].r, d + 1); }; walk(t.root, 0);
    const levels = Math.max(s.mode === 'rotate' || s.mode === 'traverse' ? T.height(t) : (s.goal || 4), T.height(t), 2);
    const stepY = Math.min(84, (H - topY - bottom - r) / (levels - 1));
    const mx = 34 + r, x = (k) => mx + (s.all.indexOf(k) * (W - 2 * mx)) / Math.max(1, n - 1), y = (d) => topY + d * stepY;
    const keys = Object.keys(t.n).map(Number);
    keys.forEach((k) => { for (const side of ['l', 'r']) { const ch = t.n[k][side]; if (ch != null) out.push(D.line('e' + ch, x(k), y(depthOf[k]), x(ch), y(depthOf[ch]), 'wire')); } });
    const root = t.root;
    keys.forEach((k) => {
      let cls = '', on = null, badge = null;
      if (s.mode === 'insert') { if (k === s.at) cls = 'cur'; else if (play && (t.n[s.at].l === k || t.n[s.at].r === k)) on = () => c.act({ t: 'go', side: t.n[s.at].l === k ? 'l' : 'r' }); }
      if (s.mode === 'traverse') { const i = s.out.indexOf(k); if (i >= 0) { cls = 'good'; badge = i + 1; } else if (play) on = () => c.act({ t: 'visit', k }); if (c.hot((a) => a.k === k)) cls += ' hot'; }
      if (s.mode === 'rotate') { if (k !== root && play) on = () => c.act({ t: 'rot', k }); if (c.hot((a) => a.k === k)) cls += ' hot'; if (s.status === 'won') cls = 'good'; }
      if (s.mode === 'order' && s.status === 'won') cls = 'good';
      out.push(D.node('n' + k, x(k), y(depthOf[k]), { r, text: k, cls, on, badge, label: `Node ${k}` }));
    });
    const info = (text, cls) => out.push(D.text('info', W / 2, 34, text, cls || '', P ? 15 : 18));
    if (s.mode === 'insert' && s.cur != null) {
      const ax = x(s.at), ay = y(depthOf[s.at]);
      out.push(D.tile('in' + s.cur, ax, ay - r - 34, { w: 58, h: 40, text: s.cur, cls: 'sel', font: 21 }));
      for (const side of ['l', 'r']) if (t.n[s.at][side] == null) {
        const gx2 = Math.max(mx, Math.min(W - mx, ax + (side === 'l' ? -1 : 1) * Math.max(r * 1.5, 40)));
        out.push(D.line('ge' + side, ax, ay, gx2, ay + stepY, 'wire thin dimw dash'));
        out.push(D.node('g' + side, gx2, ay + stepY, { r: r * 0.9, text: side === 'l' ? '◂' : '▸', cls: 'ghost' + (c.hot((a) => a.side === side) ? ' hot' : ''), on: play ? () => c.act({ t: 'go', side }) : null, label: side === 'l' ? 'Empty spot on the left' : 'Empty spot on the right' }));
      }
      const by = H - 46;
      out.push(D.btn('bl', W / 2 - (P ? 128 : 150), by, `◂  ${s.cur} is smaller`, () => c.act({ t: 'go', side: 'l' }), { w: P ? 236 : 270, font: P ? 15 : 17, cls: c.hot((a) => a.side === 'l') ? 'hot' : '' }));
      out.push(D.btn('br', W / 2 + (P ? 128 : 150), by, `${s.cur} is bigger  ▸`, () => c.act({ t: 'go', side: 'r' }), { w: P ? 236 : 270, font: P ? 15 : 17, cls: c.hot((a) => a.side === 'r') ? 'hot' : '' }));
      info(s.queue.length > 1 ? `Then: ${s.queue.slice(1).join(', ')}` : 'Last one', 'dimt');
    }
    if (s.mode === 'order') {
      const f = D.flow(n, { x: 24, y: H - 96, w: W - 48, h: 70 }, { max: 58, rows: 1, min: 20 });
      s.all.forEach((k, i) => { const used = !s.left.includes(k); out.push(D.tile('p' + k, f.pos[i].x, f.pos[i].y, { w: f.s, text: k, cls: (used ? 'hid dim' : '') + (c.hot((a) => a.k === k) ? ' hot' : ''), on: !used && play ? () => c.act({ t: 'pick', k }) : null, label: `Key ${k}` })); });
      range(s.goal).forEach((d) => out.push(D.line('lv' + d, 20, y(d) + r + 10, W - 20, y(d) + r + 10, 'wire thin dimw dash')));
      info(`Levels: ${T.height(t)} of ${s.goal} allowed`, T.height(t) > s.goal ? 'acc' : '');
    }
    if (s.mode === 'traverse') {
      const f = D.flow(n, { x: 24, y: H - 96, w: W - 48, h: 70 }, { max: 50, rows: 1, min: 20 });
      range(n).forEach((i) => out.push(D.tile('o' + i, f.pos[i].x, f.pos[i].y, { w: f.s, text: s.out[i] != null ? s.out[i] : '', cls: s.out[i] != null ? 'acc flat' : 'ghost' })));
      info({ in: 'In-order: left, node, right', pre: 'Pre-order: node, left, right', post: 'Post-order: left, right, node' }[s.order]);
    }
    if (s.mode === 'rotate') info(`Levels: ${T.height(t)}  ·  goal: ${s.goal}`);
    return out;
  };

  V.heap = (s, c) => {
    const { W, H } = c, out = [], hp = s.h, P = c.portrait, play = s.status === 'play', n = hp.length;
    const cap = s.mode === 'up' ? 9 : 7;
    const r = P ? 23 : 26, topY = s.mode === 'down' ? 122 : 74, stripY = H - 58;
    const lv = (i) => Math.floor(Math.log2(i + 1)), levels = Math.max(lv(Math.max(0, n - 1)), 2);
    const stepY = Math.min(84, (stripY - 62 - topY - r) / levels);
    const pos = (i) => { const L = lv(i), p = i - (2 ** L - 1), wid = Math.min(W - 40, 720); return { x: W / 2 - wid / 2 + ((p + 0.5) * wid) / 2 ** L, y: topY + L * stepY }; };
    const par = (i) => (i - 1) >> 1, kids = (i) => [2 * i + 1, 2 * i + 2].filter((j) => j < n);
    const cur = s.c, targets = !play || cur < 0 ? [] : s.mode === 'up' ? (cur > 0 ? [par(cur)] : []) : kids(cur);
    range(n).forEach((i) => { if (i > 0) { const a = pos(par(i)), b = pos(i); out.push(D.line('e' + i, a.x, a.y, b.x, b.y, 'wire')); } });
    const sz = Math.min(54, (W - 40) / cap / 1.14), sx = (i) => W / 2 + (i - (cap - 1) / 2) * sz * 1.14;
    range(cap).forEach((i) => out.push(D.tile('slot' + i, sx(i), stripY, { w: sz, cls: 'ghost', sub: `[${i}]` })));
    hp.forEach((v, i) => {
      const p = pos(i), isT = targets.includes(i);
      const cls = (i === cur && play ? 'cur sel' : isT ? '' : '') + (c.hot((a) => a.i === i) ? ' hot' : '');
      const on = isT ? () => c.act({ t: 'swap', i }) : null;
      out.push(D.node('h' + v, p.x, p.y, { r, text: v, cls, on, label: `${v} at slot ${i}` }));
      out.push(D.tile('a' + v, sx(i), stripY, { w: sz, text: v, cls: (i === cur && play ? 'sel' : isT ? 'acc' : '') + ' flat', on, label: `${v} in array slot ${i}` }));
    });
    out.push(D.text('al', sx(0) - sz / 2, stripY - sz / 2 - 10, 'the same heap, as an array', 'dimt left', 13));
    if (s.mode === 'down') {
      out.push(D.text('ol', W / 2, 30, s.out.length ? 'taken out, in order' : '', 'dimt', 13));
      s.out.forEach((v, i) => out.push(D.tile('o' + v, W / 2 + (i - (cap - 1) / 2) * 50, 62, { w: 44, text: v, cls: 'good flat', font: 18 })));
    }
    if (play && cur >= 0) {
      const p = pos(cur);
      out.push(D.btn('stop', P ? W / 2 : Math.min(W - 110, W / 2 + 330), P ? stripY - sz / 2 - 46 : topY + 8, 'It stays put', () => c.act({ t: 'stop' }), { w: 170, cls: c.hot((a) => a.t === 'stop') ? 'hot' : '' }));
      if (!P) out.push(D.text('who', p.x, p.y - r - 12, s.mode === 'up' ? 'climbing' : 'sinking', 'acc', 13));
    }
    return out;
  };
})();
