// graph.js: graphs. Breadth-first and depth-first search, Dijkstra,
// topological order, and minimum spanning trees.
(() => {
  const { base, strike, no, range } = BB;
  const L = BB.logic;

  BB.graphs = {
    // Ten nodes for the two traversals. Coordinates are 0..1, landscape.
    web: {
      nodes: [['A', .06, .5], ['B', .24, .2], ['C', .24, .8], ['D', .42, .5], ['E', .47, .1], ['F', .5, .9], ['G', .66, .28], ['H', .68, .72], ['I', .86, .5], ['J', .94, .12]],
      edges: [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['B', 'E'], ['C', 'F'], ['D', 'G'], ['D', 'H'], ['E', 'G'], ['F', 'H'], ['G', 'I'], ['H', 'I'], ['G', 'J']],
      start: 'A', flag: 'I',
    },
    roads: {
      nodes: [['S', .06, .5], ['A', .3, .16], ['B', .3, .84], ['C', .54, .5], ['D', .74, .14], ['E', .76, .86], ['T', .95, .5]],
      edges: [['S', 'A', 4], ['S', 'B', 2], ['A', 'B', 1], ['A', 'C', 5], ['B', 'C', 8], ['A', 'D', 9], ['C', 'D', 3], ['C', 'E', 4], ['B', 'E', 11], ['D', 'T', 6], ['E', 'T', 3], ['C', 'T', 9]],
      start: 'S', flag: 'T',
    },
    town: {
      nodes: [['A', .08, .3], ['B', .33, .1], ['C', .66, .12], ['D', .92, .36], ['E', .82, .84], ['F', .46, .9], ['G', .12, .78], ['H', .5, .5]],
      edges: [['A', 'B', 4], ['B', 'C', 7], ['C', 'D', 3], ['D', 'E', 8], ['E', 'F', 5], ['F', 'G', 6], ['G', 'A', 9], ['H', 'A', 10], ['H', 'B', 2], ['H', 'C', 11], ['H', 'E', 1], ['H', 'F', 12], ['H', 'G', 13]],
    },
    breakfast: {
      nodes: [['W', .07, .5, 'Wake up'], ['E', .3, .1, 'Crack eggs'], ['P', .3, .3, 'Heat pan'], ['U', .3, .5, 'Get spatula'], ['S', .3, .7, 'Set table'], ['K', .3, .9, 'Brew coffee'],
        ['M', .54, .1, 'Mix batter'], ['O', .64, .3, 'Pour batter'], ['F', .8, .5, 'Flip'], ['T', .93, .78, 'Eat!']],
      edges: [['W', 'E'], ['W', 'P'], ['W', 'U'], ['W', 'K'], ['E', 'M'], ['M', 'O'], ['P', 'O'], ['O', 'F'], ['U', 'F'], ['W', 'S'], ['F', 'T'], ['K', 'T'], ['S', 'T']],
      directed: true,
    },
  };
  const adj = (g, v) => g.edges.filter((e) => e[0] === v || e[1] === v).map((e) => (e[0] === v ? e[1] : e[0])).sort();
  const ids = (g) => g.nodes.map((n) => n[0]);
  const label = (g, v) => { const n = g.nodes.find((x) => x[0] === v); return n[3] || n[0]; };
  BB.adj = adj;

  // ── traverse: BFS with a queue, DFS with a stack ───────────────────────
  const fresh = (s, v) => adj(s.g, v).filter((u) => s.seen[u] == null);
  const count = (s) => Object.keys(s.seen).length;
  const bfsSettle = (s, ev) => {
    while (s.front.length && !fresh(s, s.front[0]).length) { s.front.shift(); ev.push({ t: 'deq' }); }
    if (!s.front.length || count(s) === s.g.nodes.length) { s.status = 'won'; s.front = s.kind === 'bfs' ? [] : s.front; }
  };
  const pathTo = (s, v) => { const p = []; for (let at = v; at != null; at = s.from[at]) p.unshift(at); return p; };
  L.traverse = {
    unit: 'visits',
    init(cfg, rng) {
      const g = BB.clone(BB.graphs[cfg.graph || 'web']);
      const start = cfg.vary ? rng.pick(['A', 'A', 'J', 'I']) : g.start;
      if (start !== g.start) { g.start = start; g.flag = start === 'A' ? 'I' : 'A'; }
      const s = base({ kind: cfg.kind, g, seen: { [g.start]: 0 }, dist: { [g.start]: 0 }, from: { [g.start]: null }, front: [g.start], order: [g.start], maxStrikes: 4 });
      s.prompt = cfg.kind === 'bfs' ? `Explore outward from ${g.start}. Tap the unvisited neighbours of the node at the front of the queue.` : `Explore from ${g.start}, always going deeper from the top of the stack. Backtrack only at a dead end.`;
      return s;
    },
    act(s, a) {
      const bfs = s.kind === 'bfs';
      const cur = bfs ? s.front[0] : s.front[s.front.length - 1];
      if (a.t === 'back') {
        if (bfs) return no();
        if (fresh(s, cur).length) return strike(s, `${cur} still has an unvisited neighbour. Depth-first means going deeper while you can.`);
        s.front.pop(); s.ops++;
        if (!s.front.length) s.status = 'won';
        return { ev: [{ t: 'move', v: 0.15 }] };
      }
      if (a.t !== 'visit' || !ids(s.g).includes(a.v)) return no();
      if (s.seen[a.v] != null) return no(`${a.v} has already been visited.`);
      if (!adj(s.g, cur).includes(a.v)) {
        return strike(s, bfs ? `${a.v} is not next to ${cur}. The queue says ${cur} goes first: finish its neighbours.` : `${a.v} is not next to ${cur}, the top of the stack. ${fresh(s, cur).length ? 'Go deeper from there.' : 'Dead end: backtrack first.'}`);
      }
      s.seen[a.v] = count(s); s.dist[a.v] = s.dist[cur] + 1; s.from[a.v] = cur; s.order.push(a.v); s.front.push(a.v); s.ops++;
      const ev = [{ t: 'reveal', v: s.dist[a.v] / 6 }];
      if (bfs) bfsSettle(s, ev);
      else if (count(s) === s.g.nodes.length) s.status = 'won';
      if (s.status === 'won') s.path = pathTo(s, s.g.flag);
      return { ev };
    },
    hint(s) {
      const bfs = s.kind === 'bfs';
      const cur = bfs ? s.front[0] : s.front[s.front.length - 1];
      const f = fresh(s, cur);
      if (!f.length) return { a: { t: 'back' }, note: `${cur} is a dead end: everything next to it is visited. Pop it and back up.`, line: 8 };
      return { a: { t: 'visit', v: f[0] }, note: bfs ? `${cur} is at the front of the queue. ${f[0]} is next to it and unvisited: mark it and send it to the back of the queue.` : `${cur} is on top of the stack. ${f[0]} is next to it and unvisited: go there and push it.`, line: bfs ? 8 : 7 };
    },
  };

  // ── dijkstra: always settle the closest unsettled node ─────────────────
  const relax = (s, v, ev) => {
    for (const e of s.g.edges) {
      if (e[0] !== v && e[1] !== v) continue;
      const u = e[0] === v ? e[1] : e[0], d = s.dist[v] + e[2];
      if (!s.done[u] && (s.dist[u] == null || d < s.dist[u])) { if (ev) ev.push({ t: 'relax', u, old: s.dist[u], d }); s.dist[u] = d; s.from[u] = v; }
    }
  };
  L.dijkstra = {
    unit: 'settled',
    init(cfg) {
      const g = BB.clone(BB.graphs[cfg.graph || 'roads']);
      const s = base({ g, dist: {}, done: {}, from: {}, order: [], changed: [] });
      s.dist[g.start] = 0; s.done[g.start] = true; s.from[g.start] = null; s.order.push(g.start);
      relax(s, g.start);
      s.prompt = `Find the cheapest route from ${g.start} to ${g.flag}. Each number on a node is the cheapest way found so far. Settle the closest unsettled node.`;
      return s;
    },
    act(s, a) {
      const v = a.v;
      if (a.t !== 'settle' || !ids(s.g).includes(v)) return no();
      if (s.done[v]) return no(`${v} is already settled.`);
      if (s.dist[v] == null) return strike(s, `No road to ${v} has been found yet.`);
      const open = ids(s.g).filter((u) => !s.done[u] && s.dist[u] != null);
      const best = Math.min(...open.map((u) => s.dist[u]));
      if (s.dist[v] > best) { const b = open.find((u) => s.dist[u] === best); return strike(s, `${v} costs ${s.dist[v]} so far, but ${b} costs only ${best}. A cheaper way to ${v} could still run through ${b}.`); }
      s.done[v] = true; s.order.push(v); s.ops++;
      const ev = [{ t: 'reveal', v: s.dist[v] / 16 }];
      relax(s, v, ev);
      s.changed = ev.filter((e) => e.t === 'relax').map((e) => e.u);
      const better = ev.find((e) => e.t === 'relax' && e.old != null);
      if (v === s.g.flag) { s.status = 'won'; s.path = []; for (let at = v; at != null; at = s.from[at]) s.path.unshift(at); }
      return { ev, say: better ? { who: 'bit', text: `Going through ${v} reaches ${better.u} for ${better.d}, beating the old ${better.old}. Labels can improve until a node is settled.` } : null };
    },
    hint(s) {
      const open = ids(s.g).filter((u) => !s.done[u] && s.dist[u] != null).sort((x, y) => s.dist[x] - s.dist[y]);
      return { a: { t: 'settle', v: open[0] }, note: `${open[0]} has the smallest label, ${s.dist[open[0]]}. Nothing unsettled can offer a cheaper way to it, so its label is final.`, line: 5 };
    },
  };

  // ── topo: do tasks in an order that respects every arrow ───────────────
  L.topo = {
    unit: 'tasks',
    init(cfg) {
      const g = BB.clone(BB.graphs[cfg.graph || 'breakfast']);
      return base({ g, done: [], maxStrikes: 3, prompt: 'Make breakfast. An arrow means "this before that". Tap any task whose arrows are all satisfied.' });
    },
    act(s, a) {
      if (a.t !== 'do' || !ids(s.g).includes(a.v)) return no();
      if (s.done.includes(a.v)) return no('Already done.');
      const miss = s.g.edges.find((e) => e[1] === a.v && !s.done.includes(e[0]));
      if (miss) return strike(s, `"${label(s.g, a.v)}" before "${label(s.g, miss[0])}"? Not in my kitchen.`);
      s.done.push(a.v); s.ops++;
      if (s.done.length === s.g.nodes.length) s.status = 'won';
      return { ev: [{ t: 'reveal', v: s.done.length / s.g.nodes.length }] };
    },
    hint(s) {
      const v = ids(s.g).find((x) => !s.done.includes(x) && !s.g.edges.some((e) => e[1] === x && !s.done.includes(e[0])));
      return { a: { t: 'do', v }, note: `Nothing unfinished points at "${label(s.g, v)}", so it is safe to do now.`, line: 6 };
    },
  };

  // ── mst: connect every town with the least cable ───────────────────────
  const kruskal = (g) => {
    const comp = Object.fromEntries(ids(g).map((v) => [v, v]));
    const find = (v) => (comp[v] === v ? v : (comp[v] = find(comp[v])));
    const picked = [];
    g.edges.map((e, i) => [e[2], i]).sort((x, y) => x[0] - y[0]).forEach(([, i]) => { const a = find(g.edges[i][0]), b = find(g.edges[i][1]); if (a !== b) { comp[a] = b; picked.push(i); } });
    return picked;
  };
  const mstState = (s) => {
    const comp = Object.fromEntries(ids(s.g).map((v) => [v, v]));
    const find = (v) => (comp[v] === v ? v : (comp[v] = find(comp[v])));
    let parts = s.g.nodes.length, loop = false, cost = 0, n = 0;
    s.g.edges.forEach((e, i) => { if (!s.pick[i]) return; n++; cost += e[2]; const a = find(e[0]), b = find(e[1]); if (a === b) loop = true; else { comp[a] = b; parts--; } });
    return { parts, loop, cost, n };
  };
  L.mst = {
    unit: 'cables',
    init(cfg, rng) {
      const g = BB.clone(BB.graphs[cfg.graph || 'town']);
      if (cfg.vary) { const w = rng.shuffle(g.edges.map((e) => e[2])); g.edges.forEach((e, i) => { e[2] = w[i]; }); }
      const best = kruskal(g);
      const s = base({ g, pick: {}, best, opt: best.reduce((t, i) => t + g.edges[i][2], 0), cost: 0, parts: g.nodes.length, loop: false, maxStrikes: 4 });
      s.prompt = `Connect every town. Murphy says it cannot be done for less than ${s.opt}, and for once he is right. Match it.`;
      return s;
    },
    act(s, a) {
      if (a.t !== 'edge' || !s.g.edges[a.i]) return no();
      if (s.pick[a.i]) delete s.pick[a.i]; else s.pick[a.i] = true;
      s.ops++;
      const st = mstState(s);
      Object.assign(s, { cost: st.cost, parts: st.parts, loop: st.loop });
      const ev = [{ t: 'move', v: 1 - st.parts / s.g.nodes.length }];
      if (st.parts === 1 && !st.loop) {
        if (st.cost === s.opt) { s.status = 'won'; return { ev }; }
        const r = strike(s, `Everything is connected, but that cost ${st.cost}. It can be done for ${s.opt}.`);
        r.ok = true; r.ev.push(...ev);
        return r;
      }
      return { ev, say: st.loop && s.pick[a.i] ? { who: 'murphy', text: 'A loop! Those towns were already connected. Thanks for the extra cable.' } : null };
    },
    hint(s) {
      const extra = Object.keys(s.pick).map(Number).find((i) => !s.best.includes(i));
      if (extra != null) { const e = s.g.edges[extra]; return { a: { t: 'edge', i: extra }, note: `Take out ${e[0]}–${e[1]} (${e[2]}). Its two ends can be joined more cheaply another way.` }; }
      const i = s.best.find((k) => !s.pick[k]), e = s.g.edges[i];
      return { a: { t: 'edge', i }, note: `${e[0]}–${e[1]} costs ${e[2]}: the cheapest cable left that joins two groups not yet connected.`, line: 5 };
    },
  };
})();
