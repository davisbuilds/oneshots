// views/graph.js: maps of dots and connections.
(() => {
  const { h, range } = BB, D = BB.draw, V = BB.views;

  // Shared: place a graph's 0..1 coordinates on the stage (a portrait screen
  // swaps the axes), and draw its edges.
  const frame = (g, c, o = {}) => {
    const { W, H } = c, P = c.portrait, mx = o.mx || 50, top = o.top || 56, bot = o.bot || 96;
    const pos = {};
    for (const [id, gx, gy] of g.nodes) pos[id] = P ? { x: mx + gy * (W - 2 * mx), y: top + gx * (H - top - bot) } : { x: mx + gx * (W - 2 * mx), y: top + gy * (H - top - bot) };
    return pos;
  };
  const weight = (key, a, b, w, cls) => { const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2; return D.tile(key, x, y, { w: 30, h: 24, r: 8, text: w, font: 14, cls: 'flat ' + (cls || '') }); };
  const onPath = (path, a, b) => { if (!path) return false; for (let i = 0; i < path.length - 1; i++) if ((path[i] === a && path[i + 1] === b) || (path[i] === b && path[i + 1] === a)) return true; return false; };

  V.traverse = (s, c) => {
    const { W, H } = c, out = [], g = s.g, pos = frame(g, c), bfs = s.kind === 'bfs', play = s.status === 'play';
    const cur = bfs ? s.front[0] : s.front[s.front.length - 1];
    g.edges.forEach(([a, b], i) => {
      const tree = s.from[a] === b || s.from[b] === a;
      out.push(D.line('e' + i, pos[a].x, pos[a].y, pos[b].x, pos[b].y, 'wire ' + (onPath(s.path, a, b) ? 'path' : tree ? 'on' : 'dimw')));
    });
    g.nodes.forEach(([id]) => {
      const seen = s.seen[id] != null, inFront = s.front.includes(id);
      let cls = !seen ? '' : id === cur && play ? 'cur sel' : inFront ? 'acc' : 'good';
      if (c.hot((a) => a.v === id)) cls += ' hot';
      out.push(D.node('n' + id, pos[id].x, pos[id].y, { r: 25, text: id, cls, badge: seen ? (bfs ? s.dist[id] : s.seen[id] + 1) : null, sub: id === g.flag ? '⚑ flag' : id === g.start ? 'start' : null,
        on: !seen && play ? () => c.act({ t: 'visit', v: id }) : null, label: `Node ${id}${seen ? ', visited' : ''}` }));
    });
    // The queue or the stack that decides who is explored next.
    const y = H - 44, shown = s.front.slice(0, 9), t = 42, x0 = c.portrait ? 96 : 190;
    out.push(D.text('fl', x0 - 16, y + 6, bfs ? 'Queue' : 'Stack', 'right', 17));
    out.push(D.text('fa', x0 + 4, y - 30, bfs ? '◂ front' : 'bottom', 'dimt left', 12), D.text('fb', x0 + Math.max(1, shown.length) * (t + 6) - 2, y - 30, bfs ? 'back' : 'top ▸', 'dimt right', 12));
    shown.forEach((id, i) => out.push(D.tile('f' + id, x0 + t / 2 + i * (t + 6), y, { w: t, text: id, cls: 'flat ' + (id === cur ? 'sel' : 'acc') })));
    if (!bfs) out.push(D.btn('back', W - 104, c.portrait ? y - 62 : y, 'Backtrack', () => c.act({ t: 'back' }), { w: 150, cls: (c.hot((a) => a.t === 'back') ? 'hot ' : '') + (play ? '' : 'off') }));
    out.push(D.text('info', W / 2, 30, s.status === 'won' ? `Route to the flag: ${s.path.join(' → ')}  (${s.path.length - 1} hops)` : bfs ? 'Badges count hops from the start.' : 'Badges show the order you arrived in.', s.status === 'won' ? '' : 'dimt', c.portrait ? 14 : 17));
    return out;
  };

  V.dijkstra = (s, c) => {
    const { W, H } = c, out = [], g = s.g, pos = frame(g, c, { bot: 60 }), play = s.status === 'play';
    g.edges.forEach(([a, b, w], i) => {
      const used = s.from[a] === b || s.from[b] === a;
      out.push(D.line('e' + i, pos[a].x, pos[a].y, pos[b].x, pos[b].y, 'wire ' + (onPath(s.path, a, b) ? 'path' : used && (s.done[a] && s.done[b]) ? 'on' : 'dimw')));
    });
    g.edges.forEach(([a, b, w], i) => out.push(weight('w' + i, pos[a], pos[b], w)));
    g.nodes.forEach(([id]) => {
      const d = s.dist[id], done = s.done[id];
      let cls = done ? 'good' : d != null ? 'sel' : '';
      if (c.hot((a) => a.v === id)) cls += ' hot';
      out.push(D.node('n' + id, pos[id].x, pos[id].y, { r: 26, text: id, cls, badge: d != null ? d : '∞', badgeCls: (d == null ? 'b2' : '') , sub: id === g.flag ? '⚑ goal' : id === g.start ? 'start' : null,
        on: !done && play ? () => c.act({ t: 'settle', v: id }) : null, label: `${id}: ${d == null ? 'no route yet' : 'cost ' + d}${done ? ', settled' : ''}` }));
    });
    out.push(D.text('info', W / 2, 30, s.status === 'won' ? `Cheapest route: ${s.path.join(' → ')}  = ${s.dist[g.flag]}` : 'Green is settled. Yellow has an offer that might still improve.', s.status === 'won' ? '' : 'dimt', c.portrait ? 14 : 17));
    return out;
  };

  V.topo = (s, c) => {
    const { W, H } = c, out = [], g = s.g, P = c.portrait, pos = frame(g, c, { mx: P ? 52 : 84, top: 50, bot: P ? 110 : 96 }), play = s.status === 'play';
    const bw = P ? 86 : 134, bh = 42;
    g.edges.forEach(([a, b], i) => {
      const A = pos[a], B = pos[b], dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
      const edge = Math.min(Math.abs(dx) > 1 ? (bw / 2) / (Math.abs(dx) / len) : 1e9, Math.abs(dy) > 1 ? (bh / 2) / (Math.abs(dy) / len) : 1e9);
      out.push(D.arrow('e' + i, A.x, A.y, B.x, B.y, 'wire ' + (s.done.includes(a) ? (s.done.includes(b) ? 'dimw' : 'on') : ''), { pad: edge + 6, pad0: edge }));
    });
    g.nodes.forEach(([id, , , text]) => {
      const i = s.done.indexOf(id);
      out.push(D.tile('n' + id, pos[id].x, pos[id].y, { w: bw, h: bh, r: 14, text, font: P ? 12 : 16, cls: (i >= 0 ? 'good flat' : '') + (c.hot((a) => a.v === id) ? ' hot' : ''), on: i < 0 && play ? () => c.act({ t: 'do', v: id }) : null, label: text + (i >= 0 ? ', done' : '') }));
      if (i >= 0) out.push(h('g', { key: 'bd' + id, class: 'badge', style: D.at(pos[id].x + bw / 2 - 4, pos[id].y - bh / 2 + 2) }, h('circle', { r: 12 }), h('text', { y: 4.5, text: i + 1 })));
    });
    const names = s.done.map((id) => g.nodes.find((x) => x[0] === id)[3]);
    const tail = names.slice(-(P ? 3 : 5));
    out.push(D.text('ord', W / 2, H - 34, names.length ? (names.length > tail.length ? '… → ' : '') + tail.join(' → ') : 'Your order will appear here.', names.length ? '' : 'dimt', P ? 13 : 15));
    return out;
  };

  V.mst = (s, c) => {
    const { W, H } = c, out = [], g = s.g, pos = frame(g, c, { top: 70, bot: 50 }), play = s.status === 'play';
    g.edges.forEach(([a, b, w], i) => {
      const on = !!s.pick[i], hot = c.hot((x) => x.i === i);
      out.push(D.line('e' + i, pos[a].x, pos[a].y, pos[b].x, pos[b].y, 'wire ' + (hot ? 'hotw' : on ? 'on' : 'dimw')));
    });
    g.edges.forEach(([a, b, w], i) => {
      out.push(D.line('hit' + i, pos[a].x, pos[a].y, pos[b].x, pos[b].y, 'wire fat', play ? { onclick: () => c.act({ t: 'edge', i }) } : {}));
      const A = pos[a], B = pos[b];
      out.push(D.tile('w' + i, (A.x + B.x) / 2, (A.y + B.y) / 2, { w: 32, h: 26, r: 8, text: w, font: 15, cls: 'flat ' + (s.pick[i] ? 'acc' : ''), on: play ? () => c.act({ t: 'edge', i }) : null, label: `Cable ${a} to ${b}, cost ${w}` }));
    });
    g.nodes.forEach(([id]) => out.push(D.node('n' + id, pos[id].x, pos[id].y, { r: 22, text: id, cls: s.status === 'won' ? 'good' : '' })));
    const n = Object.keys(s.pick).length;
    out.push(D.text('info', W / 2, 32, `Cable laid: ${s.cost}   ·   ${s.parts === 1 ? 'everything connected' : s.parts + ' separate groups'}${s.loop ? '   ·   there is a loop' : ''}   ·   target ${s.opt}`, s.loop ? 'acc' : '', c.portrait ? 13 : 17));
    return out;
  };
})();
